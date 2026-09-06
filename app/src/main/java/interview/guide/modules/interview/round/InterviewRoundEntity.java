package interview.guide.modules.interview.round;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "interview_rounds",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_interview_round_plan_number",
        columnNames = {"plan_id", "round_number"}),
    indexes = {
        @Index(name = "idx_interview_round_plan", columnList = "plan_id,round_number"),
        @Index(name = "idx_interview_round_text_session", columnList = "text_session_id")
    })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InterviewRoundEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "text_session_id", length = 32)
    private String textSessionId;

    @Column(name = "voice_session_id")
    private Long voiceSessionId;

    @Column(name = "round_number", nullable = false)
    private Integer roundNumber;

    @Column(name = "round_code", nullable = false, length = 32)
    private String roundCode;

    @Column(name = "interviewer_role", nullable = false, length = 80)
    private String interviewerRole;

    @Column(name = "status", nullable = false, length = 24)
    @Builder.Default
    private String status = "LOCKED";

    @Column(name = "score")
    private Integer score;

    @Column(name = "recommendation", length = 32)
    private String recommendation;

    @Column(name = "report_json", columnDefinition = "TEXT")
    private String reportJson;

    @Column(name = "handoff_summary_json", columnDefinition = "TEXT")
    private String handoffSummaryJson;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        if (status == null || status.isBlank()) {
            status = "LOCKED";
        }
    }
}
