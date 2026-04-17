package interview.guide.modules.voiceinterview.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import interview.guide.common.ai.LlmProviderRegistry;
import interview.guide.common.ai.StructuredOutputInvoker;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.interview.skill.InterviewSkillService;
import interview.guide.modules.voiceinterview.config.VoiceInterviewProperties;
import interview.guide.modules.voiceinterview.dto.VoiceInterviewLiveEvaluationDTO;
import interview.guide.modules.voiceinterview.dto.VoiceInterviewLiveEvaluationDTO.CandidateProfileDTO;
import interview.guide.modules.voiceinterview.dto.VoiceInterviewLiveEvaluationDTO.DimensionScoreDTO;
import interview.guide.modules.voiceinterview.dto.VoiceInterviewLiveEvaluationDTO.EvaluatorScoreDTO;
import interview.guide.modules.voiceinterview.model.VoiceInterviewLiveEvaluationEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewMessageEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewLiveEvaluationRepository;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewMessageRepository;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
@Slf4j
public class VoiceInterviewLiveEvaluationService implements DisposableBean {

    private static final String SYSTEM_PROMPT_PATH =
        "classpath:prompts/voice-interview/live-evaluation-system.st";
    private static final String USER_PROMPT_PATH =
        "classpath:prompts/voice-interview/live-evaluation-user.st";

    private static final List<DimensionDefinition> DIMENSIONS = List.of(
        new DimensionDefinition("communication_clarity", "表达清晰度"),
        new DimensionDefinition("technical_accuracy", "技术准确性"),
        new DimensionDefinition("reasoning_depth", "推理深度"),
        new DimensionDefinition("structure_logic", "结构逻辑"),
        new DimensionDefinition("ownership_collaboration", "主动性与协作"),
        new DimensionDefinition("business_alignment", "业务理解")
    );

    private final VoiceInterviewSessionRepository sessionRepository;
    private final VoiceInterviewMessageRepository messageRepository;
    private final VoiceInterviewLiveEvaluationRepository liveEvaluationRepository;
    private final LlmProviderRegistry llmProviderRegistry;
    private final StructuredOutputInvoker structuredOutputInvoker;
    private final VoiceInterviewProperties properties;
    private final InterviewSkillService skillService;
    private final ObjectMapper objectMapper;
    private final PromptTemplate systemPromptTemplate;
    private final PromptTemplate userPromptTemplate;
    private final BeanOutputConverter<EvaluatorSnapshotDTO> outputConverter;
    private final ExecutorService evaluatorExecutor = Executors.newVirtualThreadPerTaskExecutor();

    public VoiceInterviewLiveEvaluationService(
        VoiceInterviewSessionRepository sessionRepository,
        VoiceInterviewMessageRepository messageRepository,
        VoiceInterviewLiveEvaluationRepository liveEvaluationRepository,
        LlmProviderRegistry llmProviderRegistry,
        StructuredOutputInvoker structuredOutputInvoker,
        VoiceInterviewProperties properties,
        InterviewSkillService skillService,
        ObjectMapper objectMapper,
        ResourceLoader resourceLoader
    ) throws IOException {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.liveEvaluationRepository = liveEvaluationRepository;
        this.llmProviderRegistry = llmProviderRegistry;
        this.structuredOutputInvoker = structuredOutputInvoker;
        this.properties = properties;
        this.skillService = skillService;
        this.objectMapper = objectMapper;
        this.systemPromptTemplate = loadTemplate(resourceLoader, SYSTEM_PROMPT_PATH);
        this.userPromptTemplate = loadTemplate(resourceLoader, USER_PROMPT_PATH);
        this.outputConverter = new BeanOutputConverter<>(EvaluatorSnapshotDTO.class);
    }

    public VoiceInterviewLiveEvaluationDTO generateLiveEvaluation(Long sessionId) {
        VoiceInterviewSessionEntity session = getSession(sessionId);
        VoiceInterviewProperties.LiveEvaluationConfig config = getLiveEvaluationConfig();

        if (!config.isEnabled() || !Boolean.TRUE.equals(session.getLiveEvaluationEnabled())) {
            return getLiveEvaluation(sessionId);
        }

        List<VoiceInterviewMessageEntity> allMessages =
            messageRepository.findBySessionIdOrderBySequenceNumAsc(sessionId);
        List<VoiceInterviewMessageEntity> completedTurns = allMessages.stream()
            .filter(this::hasCandidateAnswer)
            .toList();
        int turnCount = completedTurns.size();

        if (turnCount < config.getMinTurns()) {
            return null;
        }

        List<VoiceInterviewMessageEntity> contextTurns =
            selectContextTurns(completedTurns, config.getContextTurns());
        String transcript = buildTranscript(contextTurns);
        String referenceContext =
            skillService.buildEvaluationReferenceSectionSafe(session.getSkillId());
        String dimensionCatalog = DIMENSIONS.stream()
            .map(d -> "- %s (%s)".formatted(d.label(), d.key()))
            .collect(Collectors.joining("\n"));

        Semaphore parallelism = new Semaphore(Math.max(1, config.getMaxParallelEvaluators()));
        long timeoutMs = Math.max(500L, config.getEvaluatorTimeoutMs());
        List<CompletableFuture<EvaluatorRuntimeResult>> futures = config.getEvaluators().stream()
            .map(evaluator -> evaluateSinglePerspectiveAsync(
                sessionId,
                evaluator,
                resolveProviderId(evaluator, session),
                session,
                transcript,
                referenceContext,
                dimensionCatalog,
                turnCount,
                parallelism,
                timeoutMs
            ))
            .toList();

        List<EvaluatorRuntimeResult> runtimeResults = futures.stream()
            .map(CompletableFuture::join)
            .toList();

        List<EvaluatorRuntimeResult> successful = runtimeResults.stream()
            .filter(result -> result.snapshot() != null)
            .toList();
        if (successful.isEmpty()) {
            VoiceInterviewLiveEvaluationDTO dto =
                buildPendingEvaluationDto(sessionId, turnCount, runtimeResults);
            saveEvaluation(sessionId, dto);
            return dto;
        }

        VoiceInterviewLiveEvaluationDTO dto =
            buildEvaluationDto(sessionId, turnCount, runtimeResults, successful);
        saveEvaluation(sessionId, dto);
        return dto;
    }

    public VoiceInterviewLiveEvaluationDTO getLiveEvaluation(Long sessionId) {
        return liveEvaluationRepository.findBySessionId(sessionId)
            .map(this::toDto)
            .orElse(null);
    }

    @Override
    public void destroy() {
        evaluatorExecutor.shutdownNow();
    }

    private CompletableFuture<EvaluatorRuntimeResult> evaluateSinglePerspectiveAsync(
        Long sessionId,
        VoiceInterviewProperties.EvaluatorConfig evaluator,
        String providerId,
        VoiceInterviewSessionEntity session,
        String transcript,
        String referenceContext,
        String dimensionCatalog,
        int turnCount,
        Semaphore parallelism,
        long timeoutMs
    ) {
        EvaluatorRuntimeResult timeoutFallback =
            EvaluatorRuntimeResult.failureWithMessage(
                evaluator,
                providerId,
                "本轮评分超时，暂未完成分析",
                "这个评审官没有在本次实时刷新窗口内返回结果"
            );

        return CompletableFuture.supplyAsync(() -> {
            boolean permitAcquired = false;
            try {
                parallelism.acquire();
                permitAcquired = true;

                EvaluatorSnapshotDTO snapshot = evaluateSinglePerspective(
                    evaluator,
                    providerId,
                    session,
                    transcript,
                    referenceContext,
                    dimensionCatalog,
                    turnCount
                );
                return EvaluatorRuntimeResult.success(
                    evaluator,
                    providerId,
                    normalizeSnapshot(snapshot)
                );
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn(
                    "Live evaluator interrupted: sessionId={}, evaluatorId={}, provider={}",
                    sessionId,
                    evaluator.getId(),
                    providerId
                );
                return EvaluatorRuntimeResult.failureWithMessage(
                    evaluator,
                    providerId,
                    "评分过程被中断",
                    "这个评审官在完成分析前被中断了"
                );
            } catch (Exception e) {
                log.warn(
                    "Live evaluator failed: sessionId={}, evaluatorId={}, provider={}, error={}",
                    sessionId,
                    evaluator.getId(),
                    providerId,
                    e.getMessage()
                );
                return EvaluatorRuntimeResult.failure(evaluator, providerId);
            } finally {
                if (permitAcquired) {
                    parallelism.release();
                }
            }
        }, evaluatorExecutor)
            .completeOnTimeout(timeoutFallback, timeoutMs, TimeUnit.MILLISECONDS)
            .exceptionally(error -> {
                log.warn(
                    "Live evaluator completed exceptionally: sessionId={}, evaluatorId={}, provider={}, error={}",
                    sessionId,
                    evaluator.getId(),
                    providerId,
                    error.getMessage()
                );
                return EvaluatorRuntimeResult.failure(evaluator, providerId);
            });
    }

    private EvaluatorSnapshotDTO evaluateSinglePerspective(
        VoiceInterviewProperties.EvaluatorConfig evaluator,
        String providerId,
        VoiceInterviewSessionEntity session,
        String transcript,
        String referenceContext,
        String dimensionCatalog,
        int turnCount
    ) {
        ChatClient chatClient = llmProviderRegistry.getPlainChatClient(providerId);
        String systemPrompt = systemPromptTemplate.render() + "\n\n" + outputConverter.getFormat();
        String userPrompt = userPromptTemplate.render(Map.of(
            "skillId", defaultText(session.getSkillId(), "unknown"),
            "difficulty", defaultText(session.getDifficulty(), "mid"),
            "evaluatorName", defaultText(evaluator.getName(), "评审官"),
            "evaluatorRole", defaultText(evaluator.getRole(), "综合面试质量"),
            "evaluatorFocus", defaultText(evaluator.getFocus(), "请根据对话内容判断回答质量"),
            "turnCount", turnCount,
            "dimensionCatalog", dimensionCatalog,
            "referenceContext", defaultText(referenceContext, "暂无额外参考基线"),
            "transcript", transcript
        ));

        return structuredOutputInvoker.invoke(
            chatClient,
            systemPrompt,
            userPrompt,
            outputConverter,
            ErrorCode.VOICE_EVALUATION_FAILED,
            "Live evaluation failed: ",
            "voice_live_evaluation_" + evaluator.getId(),
            log
        );
    }

    private EvaluatorSnapshotDTO normalizeSnapshot(EvaluatorSnapshotDTO raw) {
        int overallScore = clamp(raw.overallScore(), 0, 100, 0);
        int confidence = clamp(raw.confidence(), 0, 100, 60);

        Map<String, DimensionSnapshotDTO> normalizedMap = new LinkedHashMap<>();
        if (raw.dimensions() != null) {
            for (DimensionSnapshotDTO dimension : raw.dimensions()) {
                if (dimension == null || dimension.key() == null) {
                    continue;
                }
                normalizedMap.put(
                    normalizeKey(dimension.key()),
                    new DimensionSnapshotDTO(
                        normalizeKey(dimension.key()),
                        defaultText(dimension.label(), dimension.key()),
                        clamp(dimension.score(), 0, 100, overallScore),
                        defaultText(
                            dimension.rationale(),
                            "暂无更细颗粒度依据，先沿用该评审官的整体判断"
                        )
                    )
                );
            }
        }

        List<DimensionSnapshotDTO> dimensions = DIMENSIONS.stream()
            .map(definition -> normalizedMap.getOrDefault(
                definition.key(),
                new DimensionSnapshotDTO(
                    definition.key(),
                    definition.label(),
                    overallScore,
                    "暂无更细颗粒度依据，先沿用该评审官的整体判断"
                )
            ))
            .toList();

        return new EvaluatorSnapshotDTO(
            overallScore,
            confidence,
            dimensions,
            defaultText(raw.highlight(), "当前轮次信息还不足以形成稳定亮点"),
            defaultText(raw.concern(), "当前轮次信息还不足以形成稳定风险"),
            sanitizeList(raw.evidence(), 3),
            normalizeLevel(raw.estimatedLevel(), overallScore),
            defaultText(raw.communicationStyle(), "还需要更多轮对话进一步判断"),
            sanitizeList(raw.strengths(), 4),
            sanitizeList(raw.risks(), 4),
            sanitizeList(raw.coachingFocus(), 4)
        );
    }

    private VoiceInterviewLiveEvaluationDTO buildEvaluationDto(
        Long sessionId,
        int turnCount,
        List<EvaluatorRuntimeResult> runtimeResults,
        List<EvaluatorRuntimeResult> successful
    ) {
        int overallScore = weightedAverage(
            successful.stream().map(result -> result.snapshot().overallScore()).toList(),
            successful.stream().map(result -> result.snapshot().confidence()).toList()
        );
        double averageConfidence = successful.stream()
            .map(result -> result.snapshot().confidence())
            .filter(Objects::nonNull)
            .mapToInt(Integer::intValue)
            .average()
            .orElse(0);
        int confidence = (int) Math.round(averageConfidence);

        List<EvaluatorScoreDTO> evaluators = runtimeResults.stream()
            .map(result -> {
                if (result.snapshot() == null) {
                    return new EvaluatorScoreDTO(
                        defaultText(result.config().getId(), "unknown"),
                        defaultText(result.config().getName(), "评审官"),
                        defaultText(result.config().getRole(), "综合视角"),
                        result.providerId(),
                        null,
                        null,
                        defaultText(
                            result.fallbackHighlight(),
                            "这个评审官本轮暂未返回评分结果"
                        ),
                        defaultText(
                            result.fallbackConcern(),
                            "请等待下一次实时刷新"
                        ),
                        List.of()
                    );
                }
                EvaluatorSnapshotDTO snapshot = result.snapshot();
                return new EvaluatorScoreDTO(
                    result.config().getId(),
                    result.config().getName(),
                    result.config().getRole(),
                    result.providerId(),
                    snapshot.overallScore(),
                    snapshot.confidence(),
                    snapshot.highlight(),
                    snapshot.concern(),
                    snapshot.evidence()
                );
            })
            .toList();

        List<DimensionScoreDTO> dimensions = aggregateDimensions(successful);
        CandidateProfileDTO profile = aggregateCandidateProfile(successful, overallScore);
        String summary = buildSummary(profile, dimensions, overallScore);

        return new VoiceInterviewLiveEvaluationDTO(
            sessionId,
            turnCount,
            overallScore,
            confidence,
            summary,
            evaluators,
            dimensions,
            profile,
            LocalDateTime.now()
        );
    }

    private VoiceInterviewLiveEvaluationDTO buildPendingEvaluationDto(
        Long sessionId,
        int turnCount,
        List<EvaluatorRuntimeResult> runtimeResults
    ) {
        VoiceInterviewLiveEvaluationDTO previous = getLiveEvaluation(sessionId);

        List<EvaluatorScoreDTO> evaluators = runtimeResults.stream()
            .map(result -> new EvaluatorScoreDTO(
                defaultText(result.config().getId(), "unknown"),
                defaultText(result.config().getName(), "评审官"),
                defaultText(result.config().getRole(), "综合视角"),
                result.providerId(),
                null,
                null,
                defaultText(
                    result.fallbackHighlight(),
                    "本轮作答已提交，评审官正在并发分析"
                ),
                defaultText(
                    result.fallbackConcern(),
                    "当前窗口内还没有返回稳定的新评分结论"
                ),
                List.of()
            ))
            .toList();

        List<DimensionScoreDTO> dimensions =
            previous != null && previous.dimensions() != null && !previous.dimensions().isEmpty()
                ? previous.dimensions()
                : DIMENSIONS.stream()
                    .map(definition -> new DimensionScoreDTO(
                        definition.key(),
                        definition.label(),
                        0,
                        "本轮评分仍在并发生成中，先等待评审官返回稳定结论"
                    ))
                    .toList();

        CandidateProfileDTO profile =
            previous != null && previous.candidateProfile() != null
                ? previous.candidateProfile()
                : new CandidateProfileDTO(
                    "mid",
                    "实时信号采集中",
                    "热身阶段",
                    List.of(),
                    List.of("本轮六位评审官尚未在刷新窗口内返回稳定结论"),
                    List.of("继续完成下一轮作答，系统会滚动刷新画像")
                );

        int overallScore = previous != null ? defaultInt(previous.overallScore()) : 0;
        int confidence = previous != null ? defaultInt(previous.confidence()) : 0;
        String summary = previous != null
            ? "本轮作答已收到，但六位评审官暂未在刷新窗口内返回稳定新结论，当前先沿用上一轮画像。"
            : "本轮作答已收到，六位评审官正在并发评估中，稍后会滚动刷新分数与用户画像。";

        return new VoiceInterviewLiveEvaluationDTO(
            sessionId,
            turnCount,
            overallScore,
            confidence,
            summary,
            evaluators,
            dimensions,
            profile,
            LocalDateTime.now()
        );
    }

    private List<DimensionScoreDTO> aggregateDimensions(List<EvaluatorRuntimeResult> successful) {
        List<DimensionScoreDTO> dimensions = new ArrayList<>();
        for (DimensionDefinition definition : DIMENSIONS) {
            int weightedScore = 0;
            int totalWeight = 0;
            String rationale = "当前信息不足，等待更多面试轮次";
            int bestConfidence = -1;

            for (EvaluatorRuntimeResult result : successful) {
                EvaluatorSnapshotDTO snapshot = result.snapshot();
                Optional<DimensionSnapshotDTO> matched = snapshot.dimensions().stream()
                    .filter(dimension -> definition.key().equals(normalizeKey(dimension.key())))
                    .findFirst();
                if (matched.isEmpty()) {
                    continue;
                }
                int weight = Math.max(1, snapshot.confidence());
                weightedScore += matched.get().score() * weight;
                totalWeight += weight;
                if (snapshot.confidence() > bestConfidence) {
                    bestConfidence = snapshot.confidence();
                    rationale = matched.get().rationale();
                }
            }

            int score = totalWeight == 0
                ? 0
                : (int) Math.round((double) weightedScore / totalWeight);
            dimensions.add(new DimensionScoreDTO(
                definition.key(),
                definition.label(),
                score,
                rationale
            ));
        }
        return dimensions;
    }

    private CandidateProfileDTO aggregateCandidateProfile(
        List<EvaluatorRuntimeResult> successful,
        int overallScore
    ) {
        String estimatedLevel = mostFrequentValue(
            successful.stream().map(result -> result.snapshot().estimatedLevel()).toList(),
            "mid"
        );
        String communicationStyle = mostFrequentValue(
            successful.stream().map(result -> result.snapshot().communicationStyle()).toList(),
            "还需要更多轮对话进一步判断"
        );

        List<String> strengths = topTags(
            successful.stream()
                .flatMap(result -> result.snapshot().strengths().stream())
                .toList(),
            4
        );
        List<String> risks = topTags(
            successful.stream()
                .flatMap(result -> result.snapshot().risks().stream())
                .toList(),
            4
        );
        List<String> coachingFocus = topTags(
            successful.stream()
                .flatMap(result -> result.snapshot().coachingFocus().stream())
                .toList(),
            4
        );

        return new CandidateProfileDTO(
            estimatedLevel,
            communicationStyle,
            classifyCurrentState(overallScore),
            strengths,
            risks,
            coachingFocus
        );
    }

    private String buildSummary(
        CandidateProfileDTO profile,
        List<DimensionScoreDTO> dimensions,
        int overallScore
    ) {
        DimensionScoreDTO strongest = dimensions.stream()
            .max(Comparator.comparingInt(dimension -> defaultInt(dimension.score())))
            .orElse(new DimensionScoreDTO("na", "暂无", 0, ""));
        DimensionScoreDTO weakest = dimensions.stream()
            .min(Comparator.comparingInt(dimension -> defaultInt(dimension.score())))
            .orElse(new DimensionScoreDTO("na", "暂无", 0, ""));

        return "当前实时得分为 %d 分，候选人整体更接近%s水平，当前表达风格判断为“%s”。最突出的优势维度是“%s”，当前最需要补强的维度是“%s”。"
            .formatted(
                overallScore,
                levelLabel(profile.estimatedLevel()),
                defaultText(profile.communicationStyle(), "仍在观察中"),
                strongest.label(),
                weakest.label()
            );
    }

    private void saveEvaluation(Long sessionId, VoiceInterviewLiveEvaluationDTO dto) {
        try {
            VoiceInterviewLiveEvaluationEntity entity = liveEvaluationRepository.findBySessionId(sessionId)
                .orElseGet(() -> VoiceInterviewLiveEvaluationEntity.builder()
                    .sessionId(sessionId)
                    .build());

            entity.setTurnCount(dto.turnCount());
            entity.setOverallScore(dto.overallScore());
            entity.setConfidence(dto.confidence());
            entity.setSummaryText(dto.summary());
            entity.setEvaluatorsJson(objectMapper.writeValueAsString(dto.evaluators()));
            entity.setDimensionsJson(objectMapper.writeValueAsString(dto.dimensions()));
            entity.setCandidateProfileJson(objectMapper.writeValueAsString(dto.candidateProfile()));

            liveEvaluationRepository.save(entity);
        } catch (Exception e) {
            log.error("Failed to save live evaluation snapshot: sessionId={}", sessionId, e);
            throw new BusinessException(
                ErrorCode.VOICE_EVALUATION_FAILED,
                "Live evaluation save failed: " + e.getMessage()
            );
        }
    }

    private VoiceInterviewLiveEvaluationDTO toDto(VoiceInterviewLiveEvaluationEntity entity) {
        try {
            List<EvaluatorScoreDTO> evaluators = objectMapper.readValue(
                defaultText(entity.getEvaluatorsJson(), "[]"),
                new TypeReference<List<EvaluatorScoreDTO>>() {}
            );
            List<DimensionScoreDTO> dimensions = objectMapper.readValue(
                defaultText(entity.getDimensionsJson(), "[]"),
                new TypeReference<List<DimensionScoreDTO>>() {}
            );
            CandidateProfileDTO profile = objectMapper.readValue(
                defaultText(
                    entity.getCandidateProfileJson(),
                    "{\"estimatedLevel\":\"mid\",\"communicationStyle\":\"还需要更多轮对话进一步判断\",\"currentState\":\"热身阶段\",\"strengths\":[],\"risks\":[],\"coachingFocus\":[]}"
                ),
                CandidateProfileDTO.class
            );

            return new VoiceInterviewLiveEvaluationDTO(
                entity.getSessionId(),
                entity.getTurnCount(),
                entity.getOverallScore(),
                entity.getConfidence(),
                entity.getSummaryText(),
                evaluators,
                dimensions,
                profile,
                entity.getUpdatedAt()
            );
        } catch (Exception e) {
            log.error("Failed to deserialize live evaluation snapshot: sessionId={}", entity.getSessionId(), e);
            throw new BusinessException(
                ErrorCode.VOICE_EVALUATION_FAILED,
                "Live evaluation read failed: " + e.getMessage()
            );
        }
    }

    private List<VoiceInterviewMessageEntity> selectContextTurns(
        List<VoiceInterviewMessageEntity> completedTurns,
        int maxTurns
    ) {
        int window = Math.max(1, maxTurns);
        int fromIndex = Math.max(0, completedTurns.size() - window);
        return completedTurns.subList(fromIndex, completedTurns.size());
    }

    private String buildTranscript(List<VoiceInterviewMessageEntity> contextTurns) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < contextTurns.size(); i++) {
            VoiceInterviewMessageEntity message = contextTurns.get(i);
            builder.append("第").append(i + 1).append("轮")
                .append(" | 面试阶段: ")
                .append(toPhaseLabel(message.getPhase()))
                .append('\n');
            builder.append("面试官：")
                .append(defaultText(message.getAiGeneratedText(), "（暂无问题）"))
                .append('\n');
            builder.append("候选人：")
                .append(defaultText(message.getUserRecognizedText(), "（暂无回答）"))
                .append("\n\n");
        }
        return builder.toString().trim();
    }

    private boolean hasCandidateAnswer(VoiceInterviewMessageEntity message) {
        return message != null
            && message.getUserRecognizedText() != null
            && !message.getUserRecognizedText().isBlank();
    }

    private VoiceInterviewProperties.LiveEvaluationConfig getLiveEvaluationConfig() {
        VoiceInterviewProperties.LiveEvaluationConfig config = properties.getLiveEvaluation();
        return config != null ? config : new VoiceInterviewProperties.LiveEvaluationConfig();
    }

    private VoiceInterviewSessionEntity getSession(Long sessionId) {
        return sessionRepository.findById(sessionId)
            .orElseThrow(() -> new BusinessException(
                ErrorCode.VOICE_SESSION_NOT_FOUND,
                "Voice interview session not found: " + sessionId
            ));
    }

    private PromptTemplate loadTemplate(ResourceLoader loader, String location) throws IOException {
        return new PromptTemplate(
            loader.getResource(location).getContentAsString(StandardCharsets.UTF_8)
        );
    }

    private String resolveProviderId(
        VoiceInterviewProperties.EvaluatorConfig evaluator,
        VoiceInterviewSessionEntity session
    ) {
        if (evaluator.getProvider() != null && !evaluator.getProvider().isBlank()) {
            return evaluator.getProvider();
        }
        if (session.getLlmProvider() != null && !session.getLlmProvider().isBlank()) {
            return session.getLlmProvider();
        }
        return properties.getLlmProvider();
    }

    private static int weightedAverage(List<Integer> scores, List<Integer> weights) {
        int totalScore = 0;
        int totalWeight = 0;
        for (int i = 0; i < scores.size(); i++) {
            Integer score = scores.get(i);
            Integer weight = i < weights.size() ? weights.get(i) : null;
            if (score == null) {
                continue;
            }
            int safeWeight = Math.max(1, weight != null ? weight : 1);
            totalScore += score * safeWeight;
            totalWeight += safeWeight;
        }
        return totalWeight == 0 ? 0 : (int) Math.round((double) totalScore / totalWeight);
    }

    private static int clamp(Integer value, int min, int max, int fallback) {
        if (value == null) {
            return fallback;
        }
        return Math.min(max, Math.max(min, value));
    }

    private static int defaultInt(Integer value) {
        return value != null ? value : 0;
    }

    private static String defaultText(String value, String fallback) {
        return value != null && !value.isBlank() ? value.trim() : fallback;
    }

    private static String normalizeKey(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT);
    }

    private static List<String> sanitizeList(List<String> values, int maxSize) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
            .filter(Objects::nonNull)
            .map(String::trim)
            .filter(value -> !value.isBlank())
            .distinct()
            .limit(maxSize)
            .toList();
    }

    private static String normalizeLevel(String level, int overallScore) {
        if (level != null) {
            String normalized = level.trim().toLowerCase(Locale.ROOT);
            if (List.of("junior", "mid", "senior").contains(normalized)) {
                return normalized;
            }
        }
        if (overallScore >= 82) {
            return "senior";
        }
        if (overallScore >= 65) {
            return "mid";
        }
        return "junior";
    }

    private static String mostFrequentValue(List<String> values, String fallback) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String value : values) {
            if (value == null || value.isBlank()) {
                continue;
            }
            counts.merge(value.trim(), 1, Integer::sum);
        }
        return counts.entrySet().stream()
            .max(Map.Entry.comparingByValue())
            .map(Map.Entry::getKey)
            .orElse(fallback);
    }

    private static List<String> topTags(List<String> rawTags, int limit) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String tag : rawTags) {
            if (tag == null || tag.isBlank()) {
                continue;
            }
            counts.merge(tag.trim(), 1, Integer::sum);
        }
        return counts.entrySet().stream()
            .sorted((left, right) -> {
                int byCount = Integer.compare(right.getValue(), left.getValue());
                return byCount != 0 ? byCount : left.getKey().compareTo(right.getKey());
            })
            .limit(limit)
            .map(Map.Entry::getKey)
            .toList();
    }

    private static String classifyCurrentState(int overallScore) {
        if (overallScore >= 80) {
            return "强信号";
        }
        if (overallScore >= 65) {
            return "表现稳定";
        }
        if (overallScore >= 50) {
            return "热身阶段";
        }
        return "需要引导";
    }

    private static String levelLabel(String level) {
        return switch (defaultText(level, "mid")) {
            case "junior" -> "初级";
            case "senior" -> "高级";
            default -> "中级";
        };
    }

    private static String toPhaseLabel(VoiceInterviewSessionEntity.InterviewPhase phase) {
        if (phase == null) {
            return "未知阶段";
        }
        return switch (phase) {
            case INTRO -> "自我介绍";
            case TECH -> "技术问答";
            case PROJECT -> "项目深挖";
            case HR -> "综合沟通";
            case COMPLETED -> "已完成";
        };
    }

    private record DimensionDefinition(String key, String label) {
    }

    private record DimensionSnapshotDTO(
        String key,
        String label,
        Integer score,
        String rationale
    ) {
    }

    private record EvaluatorSnapshotDTO(
        Integer overallScore,
        Integer confidence,
        List<DimensionSnapshotDTO> dimensions,
        String highlight,
        String concern,
        List<String> evidence,
        String estimatedLevel,
        String communicationStyle,
        List<String> strengths,
        List<String> risks,
        List<String> coachingFocus
    ) {
    }

    private record EvaluatorRuntimeResult(
        VoiceInterviewProperties.EvaluatorConfig config,
        String providerId,
        EvaluatorSnapshotDTO snapshot,
        String fallbackHighlight,
        String fallbackConcern
    ) {
        static EvaluatorRuntimeResult success(
            VoiceInterviewProperties.EvaluatorConfig config,
            String providerId,
            EvaluatorSnapshotDTO snapshot
        ) {
            return new EvaluatorRuntimeResult(config, providerId, snapshot, null, null);
        }

        static EvaluatorRuntimeResult failure(
            VoiceInterviewProperties.EvaluatorConfig config,
            String providerId
        ) {
            return new EvaluatorRuntimeResult(
                config,
                providerId,
                null,
                "这个评审官本轮暂未返回评分结果",
                "请等待下一次实时刷新"
            );
        }

        static EvaluatorRuntimeResult failureWithMessage(
            VoiceInterviewProperties.EvaluatorConfig config,
            String providerId,
            String fallbackHighlight,
            String fallbackConcern
        ) {
            return new EvaluatorRuntimeResult(
                config,
                providerId,
                null,
                fallbackHighlight,
                fallbackConcern
            );
        }
    }
}
