import axios from 'axios';

/**
 * DK Bot - GitHub Repository Notification & Stats Bot
 * Handles GitHub repository activities and provides repository statistics
 */

/**
 * Fetch GitHub repository statistics
 */
export async function getRepositoryStats(repoFullName, githubToken) {
  try {
    const [repoInfo, contributors, languages, issues, pulls, commits] = await Promise.all([
      // Repository basic info
      axios.get(`https://api.github.com/repos/${repoFullName}`, {
        headers: { Authorization: `token ${githubToken}` }
      }),
      // Contributors
      axios.get(`https://api.github.com/repos/${repoFullName}/contributors`, {
        headers: { Authorization: `token ${githubToken}` },
        params: { per_page: 10 }
      }),
      // Languages
      axios.get(`https://api.github.com/repos/${repoFullName}/languages`, {
        headers: { Authorization: `token ${githubToken}` }
      }),
      // Issues (open and closed)
      axios.get(`https://api.github.com/repos/${repoFullName}/issues`, {
        headers: { Authorization: `token ${githubToken}` },
        params: { state: 'all', per_page: 5, sort: 'updated' }
      }),
      // Pull Requests
      axios.get(`https://api.github.com/repos/${repoFullName}/pulls`, {
        headers: { Authorization: `token ${githubToken}` },
        params: { state: 'all', per_page: 5, sort: 'updated' }
      }),
      // Recent commits
      axios.get(`https://api.github.com/repos/${repoFullName}/commits`, {
        headers: { Authorization: `token ${githubToken}` },
        params: { per_page: 5 }
      })
    ]);

    // Calculate language percentages
    const langData = languages.data || {};
    const totalBytes = Object.values(langData).reduce((sum, bytes) => sum + bytes, 0);
    const langPercentages = Object.entries(langData).map(([lang, bytes]) => ({
      language: lang,
      percentage: ((bytes / totalBytes) * 100).toFixed(1)
    })).sort((a, b) => b.percentage - a.percentage);

    // Format stats
    const stats = {
      repository: {
        name: repoInfo.data.name,
        fullName: repoInfo.data.full_name,
        description: repoInfo.data.description,
        url: repoInfo.data.html_url,
        stars: repoInfo.data.stargazers_count,
        forks: repoInfo.data.forks_count,
        watchers: repoInfo.data.watchers_count,
        openIssues: repoInfo.data.open_issues_count,
        defaultBranch: repoInfo.data.default_branch,
        createdAt: repoInfo.data.created_at,
        updatedAt: repoInfo.data.updated_at,
        language: repoInfo.data.language,
        size: repoInfo.data.size,
        license: repoInfo.data.license?.name || 'None'
      },
      contributors: contributors.data?.slice(0, 10).map(c => ({
        username: c.login,
        avatar: c.avatar_url,
        contributions: c.contributions,
        url: c.html_url
      })) || [],
      languages: langPercentages.slice(0, 10),
      recentIssues: issues.data?.filter(i => !i.pull_request).slice(0, 5).map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        user: i.user.login,
        url: i.html_url,
        createdAt: i.created_at
      })) || [],
      recentPRs: pulls.data?.slice(0, 5).map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user: pr.user.login,
        url: pr.html_url,
        createdAt: pr.created_at,
        merged: pr.merged_at !== null
      })) || [],
      recentCommits: commits.data?.slice(0, 5).map(c => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url
      })) || []
    };

    return stats;
  } catch (error) {
    console.error('Error fetching repository stats:', error.message);
    throw new Error(`Failed to fetch repository stats: ${error.message}`);
  }
}

/**
 * Format repository stats into a readable message
 */
export function formatRepositoryStats(stats) {
  const repo = stats.repository;
  
  let message = `## 📊 Repository Statistics: **${repo.name}**\n\n`;
  
  // Basic Info
  message += `**🔗 Repository:** [${repo.fullName}](${repo.url})\n`;
  if (repo.description) {
    message += `**📝 Description:** ${repo.description}\n`;
  }
  message += `**🌿 Default Branch:** \`${repo.defaultBranch}\`\n`;
  message += `**📜 License:** ${repo.license}\n\n`;
  
  // Stats
  message += `### 📈 Statistics\n\n`;
  message += `⭐ **Stars:** ${repo.stars} | 🍴 **Forks:** ${repo.forks} | 👀 **Watchers:** ${repo.watchers}\n`;
  message += `🐛 **Open Issues:** ${repo.openIssues}\n`;
  message += `💾 **Size:** ${(repo.size / 1024).toFixed(2)} MB\n\n`;
  
  // Languages
  if (stats.languages.length > 0) {
    message += `### 💻 Languages\n\n`;
    stats.languages.slice(0, 5).forEach(lang => {
      const barLength = Math.round(parseFloat(lang.percentage) / 5);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      message += `\`${lang.language}\` ${bar} ${lang.percentage}%\n`;
    });
    message += `\n`;
  }
  
  // Top Contributors
  if (stats.contributors.length > 0) {
    message += `### 👥 Top Contributors\n\n`;
    stats.contributors.slice(0, 5).forEach((contrib, idx) => {
      message += `${idx + 1}. [${contrib.username}](${contrib.url}) - **${contrib.contributions}** commits\n`;
    });
    message += `\n`;
  }
  
  // Recent PRs
  if (stats.recentPRs.length > 0) {
    message += `### 🔀 Recent Pull Requests\n\n`;
    stats.recentPRs.forEach(pr => {
      const icon = pr.state === 'open' ? '🟢' : pr.merged ? '🟣' : '🔴';
      message += `${icon} [PR #${pr.number}: ${pr.title}](${pr.url}) by @${pr.user}\n`;
    });
    message += `\n`;
  }
  
  // Recent Issues
  if (stats.recentIssues.length > 0) {
    message += `### 🐛 Recent Issues\n\n`;
    stats.recentIssues.forEach(issue => {
      const icon = issue.state === 'open' ? '🟢' : '🔴';
      message += `${icon} [#${issue.number}: ${issue.title}](${issue.url}) by @${issue.user}\n`;
    });
    message += `\n`;
  }
  
  // Recent Commits
  if (stats.recentCommits.length > 0) {
    message += `### 📝 Recent Commits\n\n`;
    stats.recentCommits.forEach(commit => {
      const date = new Date(commit.date).toLocaleDateString();
      message += `[\`${commit.sha}\`](${commit.url}) ${commit.message} - *${commit.author}* (${date})\n`;
    });
  }
  
  return message;
}

/**
 * Format GitHub activity notification
 */
export function formatActivityNotification(activity) {
  const { type, action, payload } = activity;
  
  let message = '';
  let emoji = '📢';
  
  // Handle different GitHub event types
  switch (type) {
    case 'push':
      emoji = '📤';
      message = `${emoji} **Push Event**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Branch:** \`${payload.ref.replace('refs/heads/', '')}\`\n`;
      message += `**Commits:** ${payload.commits.length}\n`;
      message += `**Pusher:** @${payload.pusher.name || payload.sender.login}\n\n`;
      if (payload.commits.length > 0) {
        message += `**Recent commits:**\n`;
        payload.commits.slice(0, 3).forEach(commit => {
          message += `- [\`${commit.id.substring(0, 7)}\`](${commit.url}) ${commit.message.split('\n')[0]}\n`;
        });
      }
      break;
      
    case 'pull_request':
      emoji = action === 'opened' ? '🟢' : action === 'closed' ? '🔴' : action === 'merged' ? '🟣' : '📝';
      message = `${emoji} **Pull Request ${action.charAt(0).toUpperCase() + action.slice(1)}**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**PR:** [#${payload.pull_request.number}: ${payload.pull_request.title}](${payload.pull_request.html_url})\n`;
      message += `**Author:** @${payload.pull_request.user.login}\n`;
      message += `**State:** ${payload.pull_request.state}\n`;
      if (payload.pull_request.body) {
        message += `\n**Description:**\n${payload.pull_request.body.substring(0, 200)}${payload.pull_request.body.length > 200 ? '...' : ''}\n`;
      }
      break;
      
    case 'issues':
      emoji = action === 'opened' ? '🟢' : action === 'closed' ? '🔴' : '📝';
      message = `${emoji} **Issue ${action.charAt(0).toUpperCase() + action.slice(1)}**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Issue:** [#${payload.issue.number}: ${payload.issue.title}](${payload.issue.html_url})\n`;
      message += `**Author:** @${payload.issue.user.login}\n`;
      message += `**State:** ${payload.issue.state}\n`;
      if (payload.issue.body) {
        message += `\n**Description:**\n${payload.issue.body.substring(0, 200)}${payload.issue.body.length > 200 ? '...' : ''}\n`;
      }
      break;
      
    case 'commit_comment':
      emoji = '💬';
      message = `${emoji} **Comment on Commit**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Comment by:** @${payload.comment.user.login}\n`;
      message += `**Commit:** [\`${payload.comment.commit_id.substring(0, 7)}\`](${payload.comment.html_url})\n`;
      message += `**Comment:**\n${payload.comment.body.substring(0, 200)}${payload.comment.body.length > 200 ? '...' : ''}\n`;
      break;
      
    case 'release':
      emoji = '🚀';
      message = `${emoji} **Release ${action.charAt(0).toUpperCase() + action.slice(1)}**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Release:** [${payload.release.name || payload.release.tag_name}](${payload.release.html_url})\n`;
      message += `**Tag:** \`${payload.release.tag_name}\`\n`;
      if (payload.release.body) {
        message += `\n**Release Notes:**\n${payload.release.body.substring(0, 200)}${payload.release.body.length > 200 ? '...' : ''}\n`;
      }
      break;
      
    case 'create':
      emoji = '✨';
      message = `${emoji} **Branch/Tag Created**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Ref:** \`${payload.ref}\`\n`;
      message += `**Type:** ${payload.ref_type}\n`;
      message += `**Author:** @${payload.sender.login}\n`;
      break;
      
    case 'delete':
      emoji = '🗑️';
      message = `${emoji} **Branch/Tag Deleted**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Ref:** \`${payload.ref}\`\n`;
      message += `**Type:** ${payload.ref_type}\n`;
      message += `**Author:** @${payload.sender.login}\n`;
      break;
      
    case 'issue_comment':
      emoji = '💬';
      message = `${emoji} **Comment on Issue**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**Issue:** [#${payload.issue.number}: ${payload.issue.title}](${payload.comment.html_url})\n`;
      message += `**Comment by:** @${payload.comment.user.login}\n`;
      message += `**Comment:**\n${payload.comment.body.substring(0, 200)}${payload.comment.body.length > 200 ? '...' : ''}\n`;
      break;
      
    case 'pull_request_review':
      emoji = '👀';
      message = `${emoji} **Pull Request Review ${action.charAt(0).toUpperCase() + action.slice(1)}**\n\n`;
      message += `**Repository:** [${payload.repository.full_name}](${payload.repository.html_url})\n`;
      message += `**PR:** [#${payload.pull_request.number}: ${payload.pull_request.title}](${payload.pull_request.html_url})\n`;
      message += `**Reviewer:** @${payload.review.user.login}\n`;
      message += `**State:** ${payload.review.state}\n`;
      if (payload.review.body) {
        message += `\n**Review Comment:**\n${payload.review.body.substring(0, 200)}${payload.review.body.length > 200 ? '...' : ''}\n`;
      }
      break;
      
    default:
      message = `📢 **GitHub Activity**\n\n**Type:** ${type}\n**Action:** ${action}\n**Repository:** [${payload.repository?.full_name || 'Unknown'}](${payload.repository?.html_url || '#'})`;
  }
  
  return message;
}

