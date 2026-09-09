package interview.guide.modules.voiceinterview.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.voiceinterview.config.VoiceInterviewProperties;
import interview.guide.modules.voiceinterview.dto.ExpressionMetricsRequest;
import interview.guide.modules.voiceinterview.dto.ExpressionMetricsSummaryDTO;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Stores privacy-preserving visual metrics and turns them into evaluation context.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class VoiceExpressionMetricsService {

    private static final String MODEL = "MediaPipe Face Landmarker (pretrained blendshape model)";

    private final VoiceInterviewSessionRepository sessionRepository;
    private final VoiceInterviewProperties properties;
    private final ObjectMapper objectMapper;

    @Transactional
    public ExpressionMetricsSummaryDTO save(Long sessionId, ExpressionMetricsRequest request) {
        VoiceInterviewSessionEntity session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new BusinessException(
                ErrorCode.VOICE_SESSION_NOT_FOUND, "语音面试会话不存在: " + sessionId));

        LocalDateTime updatedAt = LocalDateTime.now();
        ExpressionMetricsSummaryDTO summary = toSummary(request, updatedAt);
        try {
            session.setExpressionMetricsJson(objectMapper.writeValueAsString(summary));
            session.setExpressionMetricsUpdatedAt(updatedAt);
            sessionRepository.save(session);
            return summary;
        } catch (Exception e) {
            log.error("Failed to save expression metrics: sessionId={}", sessionId, e);
            throw new BusinessException(ErrorCode.VOICE_EVALUATION_FAILED,
                "保存视觉表达指标失败: " + e.getMessage());
        }
    }

    public ExpressionMetricsSummaryDTO read(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, ExpressionMetricsSummaryDTO.class);
        } catch (Exception e) {
            log.warn("Invalid expression metrics JSON, ignoring it: {}", e.getMessage());
            return null;
        }
    }

    public String buildPromptContext(String json) {
        ExpressionMetricsSummaryDTO summary = read(json);
        if (!isUsable(summary)) {
            return "【视觉表达分析】本次没有足够的有效人脸跟踪数据，视觉指标不参与评分。";
        }

        try {
            return """
                【视觉表达分析（辅助证据，不是人格或情绪诊断）】
                以下摘要来自浏览器本地运行的预训练 MediaPipe Face Landmarker。它只描述可观察的面部动作、视线稳定度和头部运动，不代表候选人的诚实性、性格、情绪疾病、能力高低或录用结论。
                请将它用于“表达/沟通呈现”维度的辅助判断，并优先依据回答内容、技术准确性和逻辑性评分；不要因为外貌、性别、肤色、残障、摄像头质量、光线或单一表情扣分。
                视觉指标 JSON：
                %s
                """.formatted(objectMapper.writeValueAsString(summary));
        } catch (Exception e) {
            log.warn("Failed to build expression prompt context: {}", e.getMessage());
            return "【视觉表达分析】指标序列化失败，视觉指标不参与评分。";
        }
    }

    public boolean isUsable(ExpressionMetricsSummaryDTO summary) {
        return summary != null
            && summary.trackedSampleCount() >= 20
            && summary.trackingRatio() >= 0.35
            && summary.durationSeconds() >= 5.0;
    }

    public Integer expressionScore(String json) {
        ExpressionMetricsSummaryDTO summary = read(json);
        return isUsable(summary) ? (int) Math.round(clamp(summary.naturalnessScore(), 0.0, 100.0)) : null;
    }

    public int weightedOverallScore(int contentScore, String json) {
        ExpressionMetricsSummaryDTO summary = read(json);
        VoiceInterviewProperties.ExpressionAnalysisConfig config = properties.getExpressionAnalysis();
        if (!config.isEnabled() || !isUsable(summary)) {
            return clampScore(contentScore);
        }

        double weight = clamp(config.getScoreWeight(), 0.0, 0.2);
        double blended = clampScore(contentScore) * (1.0 - weight)
            + clamp(summary.naturalnessScore(), 0.0, 100.0) * weight;
        return (int) Math.round(blended);
    }

    private ExpressionMetricsSummaryDTO toSummary(ExpressionMetricsRequest request, LocalDateTime updatedAt) {
        return ExpressionMetricsSummaryDTO.builder()
            .model(MODEL)
            .sampleCount(clampInt(request.sampleCount(), 0, 1_000_000))
            .trackedSampleCount(clampInt(request.trackedSampleCount(), 0, 1_000_000))
            .trackingRatio(clamp(request.trackingRatio(), 0.0, 1.0))
            .durationSeconds(clamp(request.durationSeconds(), 0.0, 86_400.0))
            .blinkCount(clampInt(request.blinkCount(), 0, 100_000))
            .blinkRatePerMinute(clamp(request.blinkRatePerMinute(), 0.0, 300.0))
            .microExpressionCount(clampInt(request.microExpressionCount(), 0, 100_000))
            .averageSmile(clamp(request.averageSmile(), 0.0, 1.0))
            .peakSmile(clamp(request.peakSmile(), 0.0, 1.0))
            .averageMouthMovement(clamp(request.averageMouthMovement(), 0.0, 1.0))
            .averageBrowTension(clamp(request.averageBrowTension(), 0.0, 1.0))
            .averageGazeAversion(clamp(request.averageGazeAversion(), 0.0, 1.0))
            .averageHeadMovement(clamp(request.averageHeadMovement(), 0.0, 1.0))
            .expressionVariation(clamp(request.expressionVariation(), 0.0, 1.0))
            .naturalnessScore(clamp(request.naturalnessScore(), 0.0, 100.0))
            .observedSignals(sanitizeSignals(request.observedSignals()))
            .updatedAt(updatedAt)
            .build();
    }

    private List<String> sanitizeSignals(List<String> signals) {
        if (signals == null) {
            return List.of();
        }
        return signals.stream()
            .filter(signal -> signal != null && !signal.isBlank())
            .map(String::trim)
            .distinct()
            .limit(12)
            .toList();
    }

    private int clampInt(Integer value, int min, int max) {
        return Math.max(min, Math.min(max, value == null ? min : value));
    }

    private double clamp(Double value, double min, double max) {
        return Math.max(min, Math.min(max, value == null ? min : value));
    }

    private int clampScore(int value) {
        return Math.max(0, Math.min(100, value));
    }
}
