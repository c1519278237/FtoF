package interview.guide.modules.interview.round;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class InterviewRoundService {

    private final InterviewRoundProperties properties;
    private final InterviewRoundRepository repository;

    public List<InterviewRoundDefinition> definitions() {
        return properties.getRounds().stream()
            .map(this::toDefinition)
            .sorted(Comparator.comparingInt(InterviewRoundDefinition::order))
            .toList();
    }

    public List<InterviewRoundDefinition> enabledDefinitions() {
        return definitions().stream().filter(InterviewRoundDefinition::enabled).toList();
    }

    public InterviewRoundDefinition definition(String roundCode) {
        String normalized = normalize(roundCode);
        return definitions().stream()
            .filter(item -> item.code().equals(normalized))
            .findFirst()
            .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "未知面试轮次: " + roundCode));
    }

    public String buildPromptContext(String roundCode) {
        return definition(roundCode).promptInstruction();
    }

    @Transactional
    public void initializePlan(String planId, String textSessionId, Long voiceSessionId,
                               List<String> enabledRoundCodes) {
        if (planId == null || planId.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "面试计划 ID 不能为空");
        }

        List<String> requested = enabledRoundCodes == null
            ? enabledDefinitions().stream().map(InterviewRoundDefinition::code).toList()
            : enabledRoundCodes.stream().map(this::normalize).distinct().toList();

        if (requested.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "至少需要启用一个面试轮次");
        }

        List<InterviewRoundEntity> existing = repository.findByPlanIdOrderByRoundNumber(planId);
        if (!existing.isEmpty()) {
            return;
        }

        List<InterviewRoundDefinition> definitions = enabledDefinitions().stream()
            .filter(item -> requested.contains(item.code()))
            .toList();

        if (definitions.size() != requested.size()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "面试轮次配置包含未知或未启用的轮次");
        }

        for (int i = 0; i < definitions.size(); i++) {
            InterviewRoundDefinition definition = definitions.get(i);
            repository.save(InterviewRoundEntity.builder()
                .planId(planId)
                .textSessionId(textSessionId)
                .voiceSessionId(voiceSessionId)
                .roundNumber(i + 1)
                .roundCode(definition.code())
                .interviewerRole(definition.interviewerRole())
                .status(i == 0 ? "READY" : "LOCKED")
                .build());
        }
        log.info("Initialized multi-round interview plan: planId={}, rounds={}", planId, definitions.size());
    }

    public List<InterviewRoundDTO> listByPlanId(String planId) {
        return repository.findByPlanIdOrderByRoundNumber(planId).stream()
            .map(entity -> InterviewRoundDTO.from(entity, definition(entity.getRoundCode())))
            .toList();
    }

    public List<InterviewRoundDTO> listByTextSessionId(String sessionId) {
        return repository.findByTextSessionIdOrderByRoundNumber(sessionId).stream()
            .map(entity -> InterviewRoundDTO.from(entity, definition(entity.getRoundCode())))
            .toList();
    }

    public List<InterviewRoundDTO> listByVoiceSessionId(Long sessionId) {
        return repository.findByVoiceSessionIdOrderByRoundNumber(sessionId).stream()
            .map(entity -> InterviewRoundDTO.from(entity, definition(entity.getRoundCode())))
            .toList();
    }

    @Transactional
    public void markStarted(String planId, String roundCode) {
        InterviewRoundEntity round = find(planId, roundCode);
        if ("LOCKED".equals(round.getStatus())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                "面试轮次尚未解锁: planId=" + planId + ", roundCode=" + roundCode);
        }
        if ("READY".equals(round.getStatus())) {
            round.setStatus("IN_PROGRESS");
        }
        if (round.getStartedAt() == null) {
            round.setStartedAt(LocalDateTime.now());
        }
        repository.save(round);
    }

    /**
     * Activate the next round when a sequential interview cursor reaches it.
     * This is distinct from score-based unlocking performed by saveResult().
     */
    @Transactional
    public void activateForSequentialFlow(String planId, String roundCode) {
        InterviewRoundEntity round = find(planId, roundCode);
        if ("LOCKED".equals(round.getStatus())) {
            round.setStatus("READY");
            repository.save(round);
        }
    }

    @Transactional
    public void markEvaluating(String planId, String roundCode) {
        InterviewRoundEntity round = find(planId, roundCode);
        if (!"COMPLETED".equals(round.getStatus())) {
            round.setStatus("EVALUATING");
            repository.save(round);
        }
    }

    @Transactional
    public void markEvaluationFailed(String planId, String roundCode, String error) {
        InterviewRoundEntity round = find(planId, roundCode);
        round.setStatus("NEEDS_REVIEW");
        round.setRecommendation("EVALUATION_FAILED");
        round.setCompletedAt(LocalDateTime.now());
        repository.save(round);
        log.error("Round evaluation failed: planId={}, roundCode={}, error={}", planId, roundCode, error);
    }

    @Transactional
    public void saveResult(String planId, String roundCode, int score, String recommendation,
                           String reportJson, String handoffSummaryJson) {
        InterviewRoundEntity round = find(planId, roundCode);
        InterviewRoundDefinition definition = definition(roundCode);
        boolean passed = score >= definition.passScore();
        round.setScore(score);
        round.setRecommendation(recommendation != null ? recommendation
            : (passed ? "PASS" : "NEEDS_REVIEW"));
        round.setReportJson(reportJson);
        round.setHandoffSummaryJson(handoffSummaryJson);
        round.setStatus(passed ? "PASSED" : "NEEDS_REVIEW");
        round.setCompletedAt(LocalDateTime.now());
        repository.save(round);

        repository.findByPlanIdOrderByRoundNumber(planId).stream()
            .filter(item -> item.getRoundNumber() > round.getRoundNumber())
            .findFirst()
            .ifPresent(next -> {
                if ("LOCKED".equals(next.getStatus())) {
                    next.setStatus(passed ? "READY" : "LOCKED");
                    repository.save(next);
                }
            });
    }

    public Optional<InterviewRoundEntity> findCurrent(String planId) {
        return repository.findByPlanIdOrderByRoundNumber(planId).stream()
            .filter(item -> "READY".equals(item.getStatus()) || "IN_PROGRESS".equals(item.getStatus())
                || "EVALUATING".equals(item.getStatus()))
            .findFirst();
    }

    public String roundCodeForPhase(String phase) {
        if (phase == null) return "screening";
        return switch (phase.toUpperCase(Locale.ROOT)) {
            case "INTRO" -> "screening";
            case "TECH" -> "technical";
            case "PROJECT" -> "project";
            case "HR" -> "final";
            default -> "final";
        };
    }

    public String phaseForRoundCode(String roundCode) {
        return switch (normalize(roundCode)) {
            case "screening" -> "INTRO";
            case "technical" -> "TECH";
            case "project" -> "PROJECT";
            case "final" -> "HR";
            default -> "COMPLETED";
        };
    }

    private InterviewRoundEntity find(String planId, String roundCode) {
        return repository.findByPlanIdAndRoundCode(planId, normalize(roundCode))
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                "面试轮次不存在: planId=" + planId + ", roundCode=" + roundCode));
    }

    private InterviewRoundDefinition toDefinition(InterviewRoundProperties.RoundConfig config) {
        return new InterviewRoundDefinition(
            normalize(config.getCode()), config.getOrder(), config.getName(), config.getInterviewerRole(),
            config.getObjective(), config.getScope(), config.getExclusions(), config.getPassScore(),
            config.getMinQuestions(), config.getMaxQuestions(), config.isEnabled());
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
