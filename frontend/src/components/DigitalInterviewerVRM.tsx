import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

interface DigitalInterviewerVRMProps {
  isSpeaking: boolean;
  isThinking: boolean;
  audioAnalyserRef: RefObject<AnalyserNode | null>;
}

const MODEL_URL = '/models/AvatarSample_A.vrm';
const BLUE_HAIR = { red: 0.12, green: 0.39, blue: 0.95 };

function setHairMaterialBlue(material: THREE.Material) {
  const candidate = material as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    needsUpdate?: boolean;
  };

  if (!material.name.toLowerCase().includes('hair')) return;

  // The sample's hair is brown in its original texture. Do not multiply that
  // texture by blue: it produces muddy black hair. A clean toon-blue surface
  // keeps the model readable and matches the blue-first identity of 蓝团.
  candidate.map = null;
  if (candidate.color) {
    const materialName = material.name.toLowerCase();
    const shade = materialName.includes('_01')
      ? BLUE_HAIR
      : materialName.includes('_02')
        ? { red: 0.18, green: 0.52, blue: 1.0 }
        : materialName.includes('_03')
          ? { red: 0.08, green: 0.24, blue: 0.72 }
          : { red: 0.25, green: 0.64, blue: 1.0 };
    candidate.color.setRGB(shade.red, shade.green, shade.blue);
  }
  candidate.needsUpdate = true;
}

function recolorHair(scene: THREE.Object3D) {
  scene.traverse(object => {
    const renderable = object as THREE.Mesh;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : [];
    materials.forEach(setHairMaterialBlue);
  });
}

function disposeVrm(vrm: VRM) {
  VRMUtils.deepDispose(vrm.scene);
}

export default function DigitalInterviewerVRM({
  isSpeaking,
  isThinking,
  audioAnalyserRef,
}: DigitalInterviewerVRMProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ isSpeaking, isThinking });
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    stateRef.current = { isSpeaking, isThinking };
  }, [isSpeaking, isThinking]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let disposed = false;
    let currentVrm: VRM | null = null;
    let animationFrame = 0;
    let lastFrameTime = performance.now();
    let nextBlinkAt = performance.now() + 2600;
    let blinkStartedAt = 0;
    const analyserData = new Uint8Array(128);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const lookAtTarget = new THREE.Object3D();
    scene.add(lookAtTarget);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.zIndex = '10';
    mount.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 1.45);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
    keyLight.position.set(1.8, 3.2, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xc8e7ff, 0.75);
    fillLight.position.set(-2, 1.4, 2.5);
    scene.add(fillLight);

    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    loader.load(
      MODEL_URL,
      gltf => {
        if (disposed) return;

        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          setLoadState('error');
          return;
        }

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        vrm.scene.traverse(object => {
          object.frustumCulled = false;
        });
        recolorHair(vrm.scene);

        // VRoid sample assets face -Z while the viewer camera is placed on +Z.
        // Rotate the complete avatar once so the interviewer faces the candidate.
        vrm.scene.rotation.y = Math.PI;

        const bounds = new THREE.Box3().setFromObject(vrm.scene);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const height = Math.max(size.y, 1.4);
        vrm.scene.position.y -= bounds.min.y;

        // Frame the head and upper body like a seated video-call participant.
        // The desk overlay hides the lower body, so the avatar reads as seated
        // behind the desk instead of appearing as a full-body T-pose.
        const portraitCenter = height * 0.74;
        camera.position.set(0, portraitCenter, height * 1.18);
        camera.lookAt(0, height * 0.72, 0);
        lookAtTarget.position.copy(camera.position);

        scene.add(vrm.scene);
        currentVrm = vrm;
        setLoadState('ready');
      },
      undefined,
      error => {
        console.error('[DigitalInterviewerVRM] Model load failed:', error);
        if (!disposed) setLoadState('error');
      },
    );

    const animate = (now: number) => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      if (currentVrm) {
        const { isSpeaking: speaking, isThinking: thinking } = stateRef.current;
        const expressionManager = currentVrm.expressionManager;
        const humanoid = currentVrm.humanoid;

        if (expressionManager) {
          let mouthLevel = 0;
          const analyser = audioAnalyserRef.current;
          if (speaking && analyser) {
            analyser.getByteTimeDomainData(analyserData);
            let energy = 0;
            for (const sample of analyserData) {
              const normalized = (sample - 128) / 128;
              energy += normalized * normalized;
            }
            const rms = Math.sqrt(energy / analyserData.length);
            mouthLevel = THREE.MathUtils.clamp((rms - 0.015) * 7, 0.04, 1);
          } else if (speaking) {
            mouthLevel = 0.18 + Math.abs(Math.sin(now / 130)) * 0.25;
          }

          expressionManager.setValue('aa', mouthLevel);
          expressionManager.setValue('happy', speaking ? 0.18 : 0.30);

          if (now >= nextBlinkAt && blinkStartedAt === 0) {
            blinkStartedAt = now;
          }
          let blinkLevel = 0;
          if (blinkStartedAt > 0) {
            const blinkElapsed = now - blinkStartedAt;
            if (blinkElapsed < 110) {
              blinkLevel = blinkElapsed / 110;
            } else if (blinkElapsed < 220) {
              blinkLevel = 1 - (blinkElapsed - 110) / 110;
            } else {
              blinkStartedAt = 0;
              nextBlinkAt = now + 2600 + Math.random() * 3400;
            }
          }
          expressionManager.setValue('blink', blinkLevel);
        }

        const head = humanoid?.getNormalizedBoneNode('head');
        if (head) {
          head.rotation.x = thinking ? 0.025 : 0;
          head.rotation.y = 0;
        }

        // Lower both arms from the source T-pose so they rest near the desk.
        // The sample's left/right bones point in opposite X directions, so the
        // Z rotations intentionally have opposite signs.
        const leftUpperArm = humanoid?.getNormalizedBoneNode('leftUpperArm');
        const rightUpperArm = humanoid?.getNormalizedBoneNode('rightUpperArm');
        const leftLowerArm = humanoid?.getNormalizedBoneNode('leftLowerArm');
        const rightLowerArm = humanoid?.getNormalizedBoneNode('rightLowerArm');
        const gesture = speaking ? Math.sin(now / 720) * 0.055 : Math.sin(now / 1900) * 0.018;

        if (leftUpperArm) {
          leftUpperArm.rotation.z = THREE.MathUtils.degToRad(66) - gesture;
          leftUpperArm.rotation.x = THREE.MathUtils.degToRad(-4);
        }
        if (rightUpperArm) {
          rightUpperArm.rotation.z = THREE.MathUtils.degToRad(-66) + gesture;
          rightUpperArm.rotation.x = THREE.MathUtils.degToRad(-4);
        }
        if (leftLowerArm) leftLowerArm.rotation.z = 0;
        if (rightLowerArm) rightLowerArm.rotation.z = 0;

        if (currentVrm.lookAt) currentVrm.lookAt.target = lookAtTarget;
        currentVrm.update(delta);
      }

      renderer.render(scene, camera);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (currentVrm) {
        scene.remove(currentVrm.scene);
        disposeVrm(currentVrm);
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [audioAnalyserRef]);

  const status = isSpeaking ? '正在说话' : isThinking ? '正在思考' : '等待你的回答';

  return (
    <div
      ref={mountRef}
      className="relative isolate aspect-video overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-900"
      style={{
        background: 'radial-gradient(circle at 50% 30%, #eff6ff 0%, #ffffff 52%, #ffffff 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-10 bottom-5 z-0 h-px bg-blue-100/80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[24%] bg-gradient-to-b from-white/70 via-white/95 to-blue-50/95 shadow-[0_-8px_20px_rgba(148,163,184,0.12)] dark:from-slate-900/80 dark:via-slate-900/95 dark:to-slate-800/95">
        <div className="absolute inset-x-0 top-0 h-2 border-y border-blue-200/90 bg-white/95 dark:border-slate-600 dark:bg-slate-800/95" />
        <div className="absolute inset-x-8 top-2 h-px bg-blue-100 dark:bg-slate-700" />
      </div>
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
        <span className={`h-2 w-2 rounded-full ${isSpeaking ? 'animate-pulse bg-emerald-400' : 'bg-blue-300'}`} />
        AI 蓝团
      </div>
      <div className="absolute bottom-4 left-4 z-20 rounded-xl bg-slate-950/75 px-3 py-2 text-xs text-white backdrop-blur-sm">
        <div className="font-medium">{loadState === 'error' ? '数字人加载失败' : status}</div>
        {isSpeaking && loadState === 'ready' && (
          <div className="mt-1 flex h-3 items-end gap-0.5" aria-label="数字人正在说话">
            {[1, 2, 3, 2, 1].map((height, index) => (
              <span
                key={index}
                className="w-1 animate-pulse rounded-full bg-cyan-300"
                style={{ height: `${height * 3}px`, animationDelay: `${index * 80}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
