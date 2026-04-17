package interview.guide.modules.voiceinterview.repository;

import interview.guide.modules.voiceinterview.model.VoiceInterviewLiveEvaluationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VoiceInterviewLiveEvaluationRepository extends JpaRepository<VoiceInterviewLiveEvaluationEntity, Long> {

    Optional<VoiceInterviewLiveEvaluationEntity> findBySessionId(Long sessionId);
}
