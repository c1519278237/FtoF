package interview.guide.modules.voiceinterview.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Aggregated, browser-side visual expression metrics for one interview session.
 * Raw video and face landmarks are intentionally not sent to the server.
 */
public record ExpressionMetricsRequest(
    @NotNull @Min(0) Integer sampleCount,
    @NotNull @Min(0) Integer trackedSampleCount,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double trackingRatio,
    @NotNull @DecimalMin("0.0") Double durationSeconds,
    @NotNull @Min(0) Integer blinkCount,
    @NotNull @DecimalMin("0.0") Double blinkRatePerMinute,
    @NotNull @Min(0) Integer microExpressionCount,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double averageSmile,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double peakSmile,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double averageMouthMovement,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double averageBrowTension,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double averageGazeAversion,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double averageHeadMovement,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double expressionVariation,
    @NotNull @DecimalMin("0.0") @DecimalMax("100.0") Double naturalnessScore,
    @Size(max = 12) List<@Size(max = 80) String> observedSignals
) {
}
