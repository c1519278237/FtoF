package interview.guide.modules.voiceinterview.dto;

import java.time.LocalDateTime;
import java.util.List;

public record VoiceInterviewLiveEvaluationDTO(
    Long sessionId,
    Integer turnCount,
    Integer overallScore,
    Integer confidence,
    String summary,
    List<EvaluatorScoreDTO> evaluators,
    List<DimensionScoreDTO> dimensions,
    CandidateProfileDTO candidateProfile,
    LocalDateTime updatedAt
) {
    public record EvaluatorScoreDTO(
        String evaluatorId,
        String evaluatorName,
        String role,
        String providerId,
        Integer score,
        Integer confidence,
        String highlight,
        String concern,
        List<String> evidence
    ) {
    }

    public record DimensionScoreDTO(
        String key,
        String label,
        Integer score,
        String rationale
    ) {
    }

    public record CandidateProfileDTO(
        String estimatedLevel,
        String communicationStyle,
        String currentState,
        List<String> strengths,
        List<String> risks,
        List<String> coachingFocus
    ) {
    }
}
