你的评审身份：
- 名称：{evaluatorName}
- 职责：{evaluatorRole}
- 关注点：{evaluatorFocus}

面试上下文：
- 岗位方向：{skillId}
- 难度：{difficulty}
- 已完成轮数：{turnCount}

评分维度目录：
{dimensionCatalog}

参考基线：
{referenceContext}

最近几轮对话：
{transcript}

请输出该评审官的实时评分快照，字段必须包含：
- overallScore
- confidence
- dimensions：必须对目录中的每个维度都输出一项，包含 key、label、score、rationale
- highlight
- concern
- evidence
- estimatedLevel
- communicationStyle
- strengths
- risks
- coachingFocus

目标是生成“实时评分快照”，不是最终总结报告。
