#!/bin/bash

# Trinity Capital Teacher Dashboard Git Management Script

echo "👨‍🏫 Pushing Teacher Dashboard Files to GitHub..."
echo "============================================="

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: This is not a Git repository. Run this script from the root of the TrinCapTeacherDash project."
    exit 1
fi

# Pull latest changes from the remote repository first to prevent rejection
echo "🔄 Pulling latest changes from GitHub..."
git pull origin master

# Check if the pull command failed (e.g., due to merge conflicts)
if [ $? -ne 0 ]; then
    echo "❌ Git pull failed. Please resolve any merge conflicts and then run the script again."
    exit 1
fi

# Stage all files
git add .

# Get commit message
echo "📝 Enter commit message for teacher dashboard changes:"
read -r commit_message

# Commit
git commit -m "$commit_message"

echo "🚀 Pushing your changes to GitHub..."
# Push to master branch on origin remote
git push origin master

echo ""
echo "✅ Teacher Dashboard files pushed to GitHub repository."