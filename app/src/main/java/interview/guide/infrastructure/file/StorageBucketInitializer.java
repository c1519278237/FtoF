package interview.guide.infrastructure.file;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Ensures the configured S3 bucket exists when the application starts.
 */
@Component
public class StorageBucketInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StorageBucketInitializer.class);

    private final FileStorageService fileStorageService;

    public StorageBucketInitializer(FileStorageService fileStorageService) {
        this.fileStorageService = fileStorageService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("Checking storage bucket on startup");
        fileStorageService.ensureBucketExists();
    }
}
