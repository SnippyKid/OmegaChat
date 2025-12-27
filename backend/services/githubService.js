import axios from 'axios';

/**
 * Fetch repository file tree structure
 */
export async function getRepositoryTree(repoFullName, githubToken, branch = 'main') {
  try {
    // First, get the default branch if not provided
    if (!branch || branch === 'main') {
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName}`,
        {
          headers: { Authorization: `token ${githubToken}` }
        }
      );
      branch = repoResponse.data.default_branch || 'main';
    }

    // Get the tree SHA for the branch
    const branchResponse = await axios.get(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${branch}`,
      {
        headers: { Authorization: `token ${githubToken}` }
      }
    );

    const treeSha = branchResponse.data.object.sha;

    // Get the recursive tree
    const treeResponse = await axios.get(
      `https://api.github.com/repos/${repoFullName}/git/trees/${treeSha}?recursive=1`,
      {
        headers: { Authorization: `token ${githubToken}` }
      }
    );

    return {
      branch,
      tree: treeResponse.data.tree,
      truncated: treeResponse.data.truncated
    };
  } catch (error) {
    console.error('Error fetching repository tree:', error.message);
    throw new Error(`Failed to fetch repository tree: ${error.message}`);
  }
}

/**
 * Fetch specific file content from repository
 */
export async function getFileContent(repoFullName, filePath, githubToken, branch = 'main') {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
      {
        headers: { Authorization: `token ${githubToken}` },
        params: { ref: branch }
      }
    );

    if (response.data.encoding === 'base64') {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return {
        content,
        size: response.data.size,
        sha: response.data.sha
      };
    }

    return {
      content: response.data.content,
      size: response.data.size,
      sha: response.data.sha
    };
  } catch (error) {
    console.error(`Error fetching file ${filePath}:`, error.message);
    throw new Error(`Failed to fetch file: ${error.message}`);
  }
}

/**
 * Get repository context - fetches key files and structure
 * Returns a summary of the repository for AI context
 */
export async function getRepositoryContext(repoFullName, githubToken, maxFiles = 20) {
  try {
    const tree = await getRepositoryTree(repoFullName, githubToken);
    
    // Filter for code files (exclude node_modules, .git, etc.)
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.dart', '.vue', '.svelte'];
    const importantFiles = ['package.json', 'requirements.txt', 'README.md', 'Dockerfile', '.env.example', 'tsconfig.json', 'webpack.config.js', 'vite.config.js'];
    
    const relevantFiles = tree.tree
      .filter(item => {
        if (item.type !== 'blob') return false;
        const path = item.path.toLowerCase();
        
        // Include important config files
        if (importantFiles.some(file => path.includes(file.toLowerCase()))) return true;
        
        // Include code files
        return codeExtensions.some(ext => path.endsWith(ext));
      })
      .slice(0, maxFiles); // Limit to avoid token limits

    // Fetch content for key files
    const fileContents = [];
    for (const file of relevantFiles.slice(0, 10)) { // Fetch first 10 files
      try {
        const content = await getFileContent(repoFullName, file.path, githubToken, tree.branch);
        fileContents.push({
          path: file.path,
          content: content.content.substring(0, 2000), // Limit content size
          size: content.size
        });
      } catch (error) {
        console.log(`Skipping file ${file.path}:`, error.message);
      }
    }

    // Get repository info
    const repoResponse = await axios.get(
      `https://api.github.com/repos/${repoFullName}`,
      {
        headers: { Authorization: `token ${githubToken}` }
      }
    );

    const repo = repoResponse.data;

    return {
      name: repo.name,
      description: repo.description,
      language: repo.language,
      languages: repo.languages_url ? await getLanguages(repoFullName, githubToken) : {},
      branch: tree.branch,
      fileCount: relevantFiles.length,
      files: fileContents,
      structure: relevantFiles.map(f => f.path)
    };
  } catch (error) {
    console.error('Error getting repository context:', error.message);
    throw error;
  }
}

/**
 * Get repository languages
 */
async function getLanguages(repoFullName, githubToken) {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repoFullName}/languages`,
      {
        headers: { Authorization: `token ${githubToken}` }
      }
    );
    return response.data;
  } catch (error) {
    return {};
  }
}

/**
 * Check if a file exists in the repository
 */
export async function checkFileExists(repoFullName, filePath, githubToken, branch = 'main') {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      {
        headers: { Authorization: `token ${githubToken}` },
        params: { ref: branch }
      }
    );
    return {
      exists: true,
      sha: response.data.sha,
      size: response.data.size
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Create or update a file in GitHub repository
 */
export async function commitFileToRepository(
  repoFullName,
  filePath,
  content,
  commitMessage,
  githubToken,
  branch = 'main',
  existingSha = null
) {
  try {
    // Get the default branch if not provided
    if (!branch || branch === 'main') {
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${repoFullName}`,
        {
          headers: { Authorization: `token ${githubToken}` }
        }
      );
      branch = repoResponse.data.default_branch || 'main';
    }

    // Encode content to base64
    const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

    // Prepare the request body
    const requestBody = {
      message: commitMessage,
      content: encodedContent,
      branch: branch
    };

    // If file exists, include the SHA to update it
    if (existingSha) {
      requestBody.sha = existingSha;
    }

    const response = await axios.put(
      `https://api.github.com/repos/${repoFullName}/contents/${encodeURIComponent(filePath)}`,
      requestBody,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      commit: response.data.commit,
      content: response.data.content,
      message: existingSha ? 'File updated successfully' : 'File created successfully'
    };
  } catch (error) {
    console.error('Error committing file to repository:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      `Failed to commit file: ${error.message}`
    );
  }
}