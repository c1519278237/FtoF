package interview.guide.modules.voiceinterview.dto;

import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Persisted visual expression summary exposed to the evaluation report.
 */
@Builder
public record ExpressionMetricsSummaryDTO(
    String model,
    int sampleCount,
    int trackedSampleCount,
    double trackingRatio,
    double durationSeconds,
    int blinkCount,
    double blinkRatePerMinute,
    int microExpressionCount,
    double averageSmile,
    double peakSmile,
    double averageMouthMovement,
    double averageBrowTension,
    double averageGazeAversion,
    double averageHeadMovement,
    double expressionVariation,
    double naturalnessScore,
    List<String> observedSignals,
    LocalDateTime updatedAt
) {
}
