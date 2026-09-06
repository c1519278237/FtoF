package interview.guide.modules.interview.model;

/**
 * 提交答案响应
 */
public record SubmitAnswerResponse(
    boolean hasNextQuestion,
    InterviewQuestionDTO nextQuestion,
    int currentIndex,
    int totalQuestions,
    boolean roundCompleted,
    boolean interviewCompleted,
    String completedRoundCode,
    String nextRoundCode,
    boolean roundEvaluationCompleted,
    boolean roundEvaluationPending,
    boolean roundPassed,
    Integer roundScore,
    Integer roundPassScore
) {
    public SubmitAnswerResponse(boolean hasNextQuestion,
                                InterviewQuestionDTO nextQuestion,
                                int currentIndex,
                                int totalQuestions) {
        this(hasNextQuestion, nextQuestion, currentIndex, totalQuestions,
            false, !hasNextQuestion, null, null, false, false, true, null, null);
    }
}
