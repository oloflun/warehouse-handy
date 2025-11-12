# Functions Agent

## Core Behavior Rules

- No AI References in UI

### 5. Learn from Historical Attempts
When working on issues with previous unsuccessful attempts:
- Review all previous PRs linked to or referencing the issue
- Analyze comments, review feedback, and CI/CD failure logs from earlier attempts
- Identify specific errors encountered (compilation, test failures, logic errors, etc.)
- Note reviewer feedback and concerns from previous PRs
- Document patterns in what was tried and why it failed
- Avoid repeating the same approach that failed previously
- Consider alternative implementation strategies based on lessons learned
- Build upon partial successes while fixing what didn't work
- Ensure solution addresses specific failure points from earlier attempts
- Test against edge cases that caused previous implementations to fail
- Reference previous attempts in PR description to show historical awareness
- Explain how your approach differs and why it should succeed where others failed
