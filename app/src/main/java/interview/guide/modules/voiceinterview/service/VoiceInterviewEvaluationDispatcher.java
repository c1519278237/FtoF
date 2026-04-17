package interview.guide.modules.voiceinterview.service;

import interview.guide.common.exception.BusinessException;
import interview.guide.common.exception.ErrorCode;
import interview.guide.common.model.AsyncTaskStatus;
import interview.guide.modules.voiceinterview.model.VoiceInterviewEvaluationEntity;
import interview.guide.modules.voiceinterview.model.VoiceInterviewSessionEntity;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewEvaluationRepository;
import interview.guide.modules.voiceinterview.repository.VoiceInterviewSessionRepository;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Service
@Slf4j
public class VoiceInterviewEvaluationDispatcher implements DisposableBean {

    private static final String SESSION_CACHE_KEY_PREFIX = "voice:interview:session:";
    private static final int CACHE_TTL_HOURS = 1;

    private final VoiceInterviewSessionRepository sessionRepository;
    private final VoiceInterviewEvaluationRepository evaluationRepository;
    private final VoiceInterviewEvaluationService evaluationService;
    private final RedissonClient redissonClient;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final Map<Long, CompletableFuture<Void>> inFlightTasks = new ConcurrentHashMap<>();

    public VoiceInterviewEvaluationDispatcher(
        VoiceInterviewSessionRepository sessionRepository,
        VoiceInterviewEvaluationRepository evaluationRepository,
        VoiceInterviewEvaluationService evaluationService,
        RedissonClient redissonClient
    ) {
        this.sessionRepository = sessionRepository;
        this.evaluationRepository = evaluationRepository;
        this.evaluationService = evaluationService;
        this.redissonClient = redissonClient;
    }

    public void requestEvaluation(Long sessionId) {
        VoiceInterviewSessionEntity session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new BusinessException(
                ErrorCode.VOICE_SESSION_NOT_FOUND,
                "Voice interview session not found: " + sessionId
            ));

        VoiceInterviewEvaluationEntity existingEvaluation =
            evaluationRepository.findBySessionId(sessionId).orElse(null);
        if (session.getEvaluateStatus() == AsyncTaskStatus.COMPLETED && existingEvaluation != null) {
            return;
        }

        inFlightTasks.compute(sessionId, (id, existingTask) -> {
            if (existingTask != null && !existingTask.isDone()) {
                updateEvaluateStatus(id, AsyncTaskStatus.PROCESSING, null);
                return existingTask;
            }

            updateEvaluateStatus(id, AsyncTaskStatus.PENDING, null);
            return CompletableFuture.runAsync(() -> runEvaluation(id), executor)
                .whenComplete((ignored, error) -> inFlightTasks.remove(id));
        });
    }

    public boolean isEvaluationRunning(Long sessionId) {
        CompletableFuture<Void> task = inFlightTasks.get(sessionId);
        return task != null && !task.isDone();
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
    }

    private void runEvaluation(Long sessionId) {
        updateEvaluateStatus(sessionId, AsyncTaskStatus.PROCESSING, null);
        try {
            evaluationService.generateEvaluation(sessionId);
            updateEvaluateStatus(sessionId, AsyncTaskStatus.COMPLETED, null);
            log.info("Voice interview evaluation completed locally: sessionId={}", sessionId);
        } catch (Exception e) {
            log.error("Voice interview evaluation failed locally: sessionId={}", sessionId, e);
            updateEvaluateStatus(
                sessionId,
                AsyncTaskStatus.FAILED,
                truncateError("Voice evaluation failed: " + e.getMessage())
            );
        }
    }

    private void updateEvaluateStatus(Long sessionId, AsyncTaskStatus status, String error) {
        sessionRepository.findById(sessionId).ifPresent(session -> {
            session.setEvaluateStatus(status);
            session.setEvaluateError(error);
            VoiceInterviewSessionEntity saved = sessionRepository.save(session);
            refreshSessionCache(saved);
        });
    }

    private String truncateError(String error) {
        if (error == null) {
            return null;
        }
        return error.length() > 500 ? error.substring(0, 500) : error;
    }

    private void refreshSessionCache(VoiceInterviewSessionEntity session) {
        RBucket<VoiceInterviewSessionEntity> bucket =
            redissonClient.getBucket(SESSION_CACHE_KEY_PREFIX + session.getId());
        bucket.set(session, Duration.ofHours(CACHE_TTL_HOURS));
    }
}
