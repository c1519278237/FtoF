package interview.guide.modules.voiceinterview.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "voice_interview_live_evaluations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VoiceInterviewLiveEvaluationEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", unique = true, nullable = false)
    private Long sessionId;

    @Column(name = "turn_count")
    private Integer turnCount;

    @Column(name = "overall_score")
    private Integer overallScore;

    @Column(name = "confidence")
    private Integer confidence;

    @Column(name = "summary_text", columnDefinition = "TEXT")
    private String summaryText;

    @Column(name = "evaluators_json", columnDefinition = "TEXT")
    private String evaluatorsJson;

    @Column(name = "dimensions_json", columnDefinition = "TEXT")
    private String dimensionsJson;

    @Column(name = "candidate_profile_json", columnDefinition = "TEXT")
    private String candidateProfileJson;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
