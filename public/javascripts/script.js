document.addEventListener('DOMContentLoaded', function() {
  const toggleButtons = document.querySelectorAll('.toggle-comments');
  toggleButtons.forEach(button => {
    button.addEventListener('click', function() {
      const commentsDiv = document.getElementById(`comments-${this.dataset.id}`);
      if (!commentsDiv) {
        console.error(`Comments div with id 'comments-${this.dataset.id}' not found`);
        return;
      }
      if (commentsDiv.style.display === 'none' || commentsDiv.style.display === '') {
        commentsDiv.style.display = 'block';
        this.textContent = 'Hide Comments';
      } else {
        commentsDiv.style.display = 'none';
        this.textContent = 'Show Comments';
      }
    });
  });

  const hearts = document.querySelectorAll('.heart');
  hearts.forEach(heart => {
    heart.addEventListener('click', function() {
      let postId = this.dataset.id;
      postId = postId.replace(/"/g, '')
      likePost(postId);
    });
  });
});

async function likePost(postId) {
  try {
    const response = await fetch(`/like-post/${postId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ postId })
    });
    if (!response.ok) {
      throw new Error('Failed to like post');
    }
    const data = await response.json();
    if (data.alreadyLiked) {
      console.log('Post already liked by this user');
    } else {
      console.log('Post liked successfully');
    }
  } catch (error) {
    console.error('Error liking post:', error);
  }
}
