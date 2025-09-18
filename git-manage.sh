#!/bin/bash

# Trinity Capital Teacher Dashboard Git Management Script

echo "👨‍🏫 Pushing Teacher Dashboard Files to GitHub..."
echo "============================================="

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: This is not a Git repository. Run this script from the root of the TrinCapTeacherDash project."
    exit 1
fi

# Stage all files
git add .

# Get commit message
echo "📝 Enter commit message for teacher dashboard changes:"
read -r commit_message

# Commit
git commit -m "$commit_message"

# Push to master branch on origin remote
git push origin master

echo ""
echo "✅ Teacher Dashboard files pushed to GitHub repository."