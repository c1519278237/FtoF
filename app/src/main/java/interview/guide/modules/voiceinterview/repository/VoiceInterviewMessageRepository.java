package interview.guide.modules.voiceinterview.repository;

import interview.guide.modules.voiceinterview.model.VoiceInterviewMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 语音面试消息Repository
 */
@Repository
public interface VoiceInterviewMessageRepository extends JpaRepository<VoiceInterviewMessageEntity, Long> {

    /**
     * 根据会话ID查找所有消息，按序号升序排列
     */
    List<VoiceInterviewMessageEntity> findBySessionIdOrderBySequenceNumAsc(Long sessionId);

    Optional<VoiceInterviewMessageEntity> findTopBySessionIdOrderBySequenceNumDesc(Long sessionId);

    long countBySessionId(Long sessionId);

    void deleteBySessionId(Long sessionId);
}
