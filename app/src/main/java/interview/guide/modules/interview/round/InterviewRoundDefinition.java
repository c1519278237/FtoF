package interview.guide.modules.interview.round;

/**
 * One interviewer's responsibility in the multi-round interview plan.
 */
public record InterviewRoundDefinition(
    String code,
    int order,
    String name,
    String interviewerRole,
    String objective,
    String scope,
    String exclusions,
    int passScore,
    int minQuestions,
    int maxQuestions,
    boolean enabled
) {
    public String promptInstruction() {
        return "本轮面试官：" + interviewerRole + "\n"
            + "本轮目标：" + objective + "\n"
            + "重点考察：" + scope + "\n"
            + "明确不要考察：" + exclusions + "\n"
            + "出题要求：本轮问题必须服务于本轮目标；不要重复其他轮次职责；"
            + "必要时只围绕本轮目标追问候选人的具体证据。";
    }
}
