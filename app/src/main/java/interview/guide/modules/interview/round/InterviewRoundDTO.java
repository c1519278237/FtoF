package interview.guide.modules.interview.round;

import java.time.LocalDateTime;

public record InterviewRoundDTO(
    Long id,
    String planId,
    Integer roundNumber,
    String roundCode,
    String name,
    String interviewerRole,
    String objective,
    String status,
    Integer score,
    String recommendation,
    LocalDateTime startedAt,
    LocalDateTime completedAt
) {
    public static InterviewRoundDTO from(InterviewRoundEntity entity,
                                         InterviewRoundDefinition definition) {
        return new InterviewRoundDTO(
            entity.getId(), entity.getPlanId(), entity.getRoundNumber(), entity.getRoundCode(),
            definition.name(), definition.interviewerRole(), definition.objective(),
            entity.getStatus(), entity.getScore(), entity.getRecommendation(),
            entity.getStartedAt(), entity.getCompletedAt()
        );
    }
}
