package interview.guide.modules.interview.round;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InterviewRoundRepository extends JpaRepository<InterviewRoundEntity, Long> {

    List<InterviewRoundEntity> findByPlanIdOrderByRoundNumber(String planId);

    List<InterviewRoundEntity> findByTextSessionIdOrderByRoundNumber(String textSessionId);

    List<InterviewRoundEntity> findByVoiceSessionIdOrderByRoundNumber(Long voiceSessionId);

    Optional<InterviewRoundEntity> findByPlanIdAndRoundCode(String planId, String roundCode);
}
