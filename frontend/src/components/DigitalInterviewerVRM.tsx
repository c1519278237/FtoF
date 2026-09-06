import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';

interface DigitalInterviewerVRMProps {
  isSpeaking: boolean;
  isThinking: boolean;
  audioAnalyserRef: RefObject<AnalyserNode | null>;
}

const MODEL_URL = '/models/VRM1_Constraint_Twist_Sample.vrm';

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
    let nextBlinkAt = performance.now() + 2800;
    let blinkStartedAt = 0;
    const analyserData = new Uint8Array(128);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#071a3a');

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 1.2, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.HemisphereLight(0xb9d9ff, 0x172554, 2.1);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(1.5, 2.4, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 8, 8);
    rimLight.position.set(-2, 1.5, -1);
    scene.add(rimLight);

    const lookAtTarget = new THREE.Object3D();
    lookAtTarget.position.set(0, 1.25, 0);
    scene.add(lookAtTarget);

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

        const bounds = new THREE.Box3().setFromObject(vrm.scene);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const height = Math.max(size.y, 1.4);
        vrm.scene.position.y -= bounds.min.y;
        camera.position.set(0, height * 0.52, height * 2.45);
        camera.lookAt(0, height * 0.5, 0);
        lookAtTarget.position.set(0, height * 0.62, 0);

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
          expressionManager.setValue('happy', speaking ? 0.12 : 0.28);

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
              nextBlinkAt = now + 2600 + Math.random() * 3600;
            }
          }
          expressionManager.setValue('blink', blinkLevel);
        }

        const head = humanoid?.getNormalizedBoneNode('head');
        if (head) {
          head.rotation.x = (thinking ? 0.035 : 0) + (speaking ? Math.sin(now / 180) * 0.012 : 0);
          head.rotation.y = Math.sin(now / 2100) * 0.035;
        }

        const leftUpperArm = humanoid?.getNormalizedBoneNode('leftUpperArm');
        if (leftUpperArm) {
          leftUpperArm.rotation.z = Math.sin(now / 1750) * 0.025;
        }

        const rightUpperArm = humanoid?.getNormalizedBoneNode('rightUpperArm');
        if (rightUpperArm) {
          rightUpperArm.rotation.z = (speaking ? Math.sin(now / 520) * 0.07 : 0) + Math.sin(now / 1900) * 0.02;
        }

        if (currentVrm.lookAt) {
          currentVrm.lookAt.target = lookAtTarget;
        }
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
        VRMUtils.deepDispose(currentVrm.scene);
      }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [audioAnalyserRef]);

  const status = isSpeaking ? '正在说话' : isThinking ? '正在思考' : '等待你的回答';

  return (
    <div
      ref={mountRef}
      className="relative aspect-video overflow-hidden rounded-2xl border border-blue-200 bg-[#071a3a] shadow-inner dark:border-blue-900"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.22),transparent_58%)]" />
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
        <span className={`h-2 w-2 rounded-full ${isSpeaking ? 'animate-pulse bg-emerald-400' : 'bg-blue-300'}`} />
        AI 数字面试官 · VRM
      </div>
      <div className="absolute bottom-4 left-4 rounded-xl bg-slate-950/65 px-3 py-2 text-xs text-white backdrop-blur-sm">
        <div className="font-medium">{loadState === 'error' ? 'VRM 模型加载失败' : status}</div>
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
