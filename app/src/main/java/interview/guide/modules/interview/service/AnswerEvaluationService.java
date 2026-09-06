package interview.guide.modules.interview.service;

import interview.guide.common.evaluation.EvaluationReport;
import interview.guide.common.evaluation.QaRecord;
import interview.guide.common.evaluation.UnifiedEvaluationService;
import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.modules.interview.model.InterviewQuestionDTO;
import interview.guide.modules.interview.model.InterviewReportDTO;
import interview.guide.modules.interview.round.InterviewRoundDefinition;
import interview.guide.modules.interview.round.InterviewRoundService;
import interview.guide.modules.interview.skill.InterviewSkillService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Evaluates the complete interview and, when round metadata exists, also saves
 * an independent report and handoff summary for every interviewer role.
 */
@Service
public class AnswerEvaluationService {

    private static final Logger log = LoggerFactory.getLogger(AnswerEvaluationService.class);

    private final UnifiedEvaluationService unifiedEvaluationService;
    private final InterviewPersistenceService persistenceService;
    private final InterviewSkillService skillService;
    private final InterviewRoundService roundService;
    private final ObjectMapper objectMapper;

    public AnswerEvaluationService(UnifiedEvaluationService unifiedEvaluationService,
                                   InterviewPersistenceService persistenceService,
                                   InterviewSkillService skillService,
                                   InterviewRoundService roundService,
                                   ObjectMapper objectMapper) {
        this.unifiedEvaluationService = unifiedEvaluationService;
        this.persistenceService = persistenceService;
        this.skillService = skillService;
        this.roundService = roundService;
        this.objectMapper = objectMapper;
    }

    public InterviewReportDTO evaluateInterview(ChatClient chatClient, String sessionId, String resumeText,
                                                List<InterviewQuestionDTO> questions) {
        log.info("开始评估面试: {}, 共{}题", sessionId, questions.size());

        try {
            String referenceContext = skillService.buildEvaluationReferenceSectionSafe(
                persistenceService.findBySessionId(sessionId)
                    .map(s -> s.getSkillId())
                    .orElse(null)
            );

            boolean hasRoundMetadata = questions.stream()
                .anyMatch(question -> question.roundCode() != null && !question.roundCode().isBlank());
            if (!hasRoundMetadata) {
                EvaluationReport report = unifiedEvaluationService.evaluate(
                    chatClient, sessionId, toQaRecords(questions), resumeText, referenceContext
                );
                return toInterviewReportDTO(report, sessionId);
            }

            Map<String, List<InterviewQuestionDTO>> grouped = questions.stream()
                .collect(Collectors.groupingBy(this::resolveRoundCode, LinkedHashMap::new, Collectors.toList()));
            List<InterviewReportDTO> roundReports = new ArrayList<>();

            for (Map.Entry<String, List<InterviewQuestionDTO>> entry : grouped.entrySet()) {
                String roundCode = entry.getKey();
                InterviewRoundDefinition definition = roundService.definition(roundCode);
                persistenceService.findBySessionId(sessionId).ifPresent(session -> {
                    if (session.getPlanId() != null) {
                        roundService.markEvaluating(session.getPlanId(), roundCode);
                    }
                });
                String roundReference = referenceContext + "\n\n本轮评分职责："
                    + definition.promptInstruction()
                    + "\n本轮通过参考分数：" + definition.passScore();
                EvaluationReport evaluation = unifiedEvaluationService.evaluate(
                    chatClient, sessionId + ":" + roundCode, toQaRecords(entry.getValue()),
                    resumeText, roundReference
                );
                InterviewReportDTO roundReport = toInterviewReportDTO(evaluation, sessionId);
                roundReports.add(roundReport);

                persistenceService.findBySessionId(sessionId).ifPresent(session -> {
                    if (session.getPlanId() == null) {
                        return;
                    }
                    try {
                        roundService.saveResult(
                            session.getPlanId(), roundCode, roundReport.overallScore(),
                            roundReport.overallScore() >= definition.passScore() ? "PASS" : "NEEDS_REVIEW",
                            writeReportJson(roundReport),
                            buildHandoffSummary(roundReport, definition)
                        );
                    } catch (Exception e) {
                        log.error("保存轮次报告失败: sessionId={}, roundCode={}", sessionId, roundCode, e);
                    }
                });
            }

            return mergeRoundReports(sessionId, roundReports);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("面试评估失败: {}", e.getMessage(), e);
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED,
                "面试评估失败: " + e.getMessage());
        }
    }

    /**
     * Evaluates one round before the sequential flow can unlock the next round.
     */
    public InterviewReportDTO evaluateRound(ChatClient chatClient, String sessionId, String resumeText,
                                            String roundCode, List<InterviewQuestionDTO> questions) {
        if (questions == null || questions.isEmpty()) {
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED, "本轮没有可评估的题目");
        }

        try {
            String referenceContext = skillService.buildEvaluationReferenceSectionSafe(
                persistenceService.findBySessionId(sessionId)
                    .map(session -> session.getSkillId())
                    .orElse(null)
            );
            InterviewRoundDefinition definition = roundService.definition(roundCode);
            persistenceService.findBySessionId(sessionId).ifPresent(session -> {
                if (session.getPlanId() != null) {
                    roundService.markEvaluating(session.getPlanId(), definition.code());
                }
            });

            String roundReference = referenceContext + "\n\n本轮评分职责："
                + definition.promptInstruction()
                + "\n本轮通过参考分数：" + definition.passScore();
            EvaluationReport evaluation = unifiedEvaluationService.evaluate(
                chatClient, sessionId + ":" + definition.code(), toQaRecords(questions),
                resumeText, roundReference
            );
            InterviewReportDTO report = toInterviewReportDTO(evaluation, sessionId);

            persistenceService.findBySessionId(sessionId).ifPresent(session -> {
                if (session.getPlanId() == null) {
                    return;
                }
                try {
                    roundService.saveResult(
                        session.getPlanId(), definition.code(), report.overallScore(),
                        report.overallScore() >= definition.passScore() ? "PASS" : "NEEDS_REVIEW",
                        writeReportJson(report), buildHandoffSummary(report, definition)
                    );
                } catch (Exception e) {
                    log.error("保存本轮评估失败: sessionId={}, roundCode={}", sessionId, definition.code(), e);
                }
            });
            return report;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("本轮面试评估失败: sessionId={}, roundCode={}", sessionId, roundCode, e);
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED,
                "本轮面试评估失败: " + e.getMessage());
        }
    }

    private String writeReportJson(InterviewReportDTO report) {
        try {
            return objectMapper.writeValueAsString(report);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERVIEW_EVALUATION_FAILED, "保存评估报告失败");
        }
    }

    private List<QaRecord> toQaRecords(List<InterviewQuestionDTO> questions) {
        return questions.stream()
            .map(q -> new QaRecord(q.questionIndex(), q.question(), q.category(), q.userAnswer()))
            .toList();
    }

    private String resolveRoundCode(InterviewQuestionDTO question) {
        return question.roundCode() != null && !question.roundCode().isBlank()
            ? question.roundCode() : "technical";
    }

    private InterviewReportDTO toInterviewReportDTO(EvaluationReport report, String sessionId) {
        return new InterviewReportDTO(
            sessionId,
            report.totalQuestions(),
            report.overallScore(),
            report.categoryScores().stream()
                .map(cs -> new InterviewReportDTO.CategoryScore(cs.category(), cs.score(), cs.questionCount()))
                .toList(),
            report.questionDetails().stream()
                .map(qe -> new InterviewReportDTO.QuestionEvaluation(qe.questionIndex(), qe.question(), qe.category(),
                    qe.userAnswer(), qe.score(), qe.feedback()))
                .toList(),
            report.overallFeedback(),
            report.strengths(),
            report.improvements(),
            report.referenceAnswers().stream()
                .map(ra -> new InterviewReportDTO.ReferenceAnswer(ra.questionIndex(), ra.question(),
                    ra.referenceAnswer(), ra.keyPoints()))
                .toList()
        );
    }

    private InterviewReportDTO mergeRoundReports(String sessionId, List<InterviewReportDTO> reports) {
        if (reports.isEmpty()) {
            return new InterviewReportDTO(sessionId, 0, 0, List.of(), List.of(),
                "没有可评估的轮次", List.of(), List.of(), List.of());
        }

        int totalQuestions = reports.stream().mapToInt(InterviewReportDTO::totalQuestions).sum();
        int overallScore = totalQuestions == 0 ? 0 : (int) Math.round(
            reports.stream()
                .mapToDouble(report -> (double) report.overallScore() * report.totalQuestions())
                .sum() / totalQuestions
        );
        List<InterviewReportDTO.CategoryScore> categories = reports.stream()
            .flatMap(report -> report.categoryScores().stream()).toList();
        List<InterviewReportDTO.QuestionEvaluation> details = reports.stream()
            .flatMap(report -> report.questionDetails().stream()).toList();
        List<InterviewReportDTO.ReferenceAnswer> references = reports.stream()
            .flatMap(report -> report.referenceAnswers().stream()).toList();
        List<String> strengths = reports.stream()
            .flatMap(report -> report.strengths().stream())
            .filter(item -> item != null && !item.isBlank()).distinct().limit(8).toList();
        List<String> improvements = reports.stream()
            .flatMap(report -> report.improvements().stream())
            .filter(item -> item != null && !item.isBlank()).distinct().limit(8).toList();
        String feedback = reports.stream()
            .map(InterviewReportDTO::overallFeedback)
            .filter(item -> item != null && !item.isBlank())
            .collect(Collectors.joining("\n\n"));

        return new InterviewReportDTO(sessionId, totalQuestions, overallScore, categories, details,
            feedback, strengths, improvements, references);
    }

    private String buildHandoffSummary(InterviewReportDTO report, InterviewRoundDefinition definition) {
        Map<String, Object> handoff = new LinkedHashMap<>();
        handoff.put("completedRound", definition.code());
        handoff.put("interviewerRole", definition.interviewerRole());
        handoff.put("score", report.overallScore());
        handoff.put("recommendation",
            report.overallScore() >= definition.passScore() ? "PASS" : "NEEDS_REVIEW");
        handoff.put("strengths", report.strengths());
        handoff.put("risks", report.improvements());
        handoff.put("nextInterviewerFocus", report.improvements());
        try {
            return objectMapper.writeValueAsString(handoff);
        } catch (Exception e) {
            log.error("生成轮次交接摘要失败: roundCode={}", definition.code(), e);
            return "{}";
        }
    }
}
