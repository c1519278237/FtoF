package interview.guide.modules.interview.round;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Data
@Component
@ConfigurationProperties(prefix = "app.interview")
public class InterviewRoundProperties {

    private List<RoundConfig> rounds = defaultRounds();

    private static List<RoundConfig> defaultRounds() {
        return new ArrayList<>(List.of(
            new RoundConfig("screening", 1, "简历初筛", "简历初筛官",
                "判断简历真实性、沟通表达、求职动机和岗位匹配",
                "简历事实、个人贡献、求职动机、沟通表达、入职条件",
                "深入算法、系统设计和底层原理", 60, 1, 5, true),
            new RoundConfig("technical", 2, "技术基础", "技术基础官",
                "判断技术基础、原理理解、编码思路和排障能力",
                "语言、框架、数据库、缓存、并发、网络、算法、Debug",
                "重复职业规划和完整项目复盘", 65, 1, 8, true),
            new RoundConfig("project", 3, "项目与架构", "项目与架构官",
                "验证项目真实性、个人贡献、架构设计和技术取舍",
                "项目背景、个人贡献、架构、性能、可靠性、故障处理、取舍",
                "大范围基础知识普查和重复自我介绍", 65, 1, 7, true),
            new RoundConfig("final", 4, "综合终面", "综合终面官",
                "判断业务匹配、责任意识、协作能力、成长性和最终录用风险",
                "业务理解、责任意识、协作、取舍、成长、风险确认",
                "重复前三轮的完整题目和基础知识考察", 60, 1, 5, true)
        ));
    }

    @Data
    public static class RoundConfig {
        private String code;
        private int order;
        private String name;
        private String interviewerRole;
        private String objective;
        private String scope;
        private String exclusions;
        private int passScore;
        private int minQuestions;
        private int maxQuestions;
        private boolean enabled;

        public RoundConfig() {
        }

        public RoundConfig(String code, int order, String name, String interviewerRole,
                           String objective, String scope, String exclusions,
                           int passScore, int minQuestions, int maxQuestions, boolean enabled) {
            this.code = code;
            this.order = order;
            this.name = name;
            this.interviewerRole = interviewerRole;
            this.objective = objective;
            this.scope = scope;
            this.exclusions = exclusions;
            this.passScore = passScore;
            this.minQuestions = minQuestions;
            this.maxQuestions = maxQuestions;
            this.enabled = enabled;
        }
    }
}
