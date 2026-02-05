
const getPostLink = (post) => {
    if (post.platform === 'instagram') {
        if (post.original_url) {
            return post.original_url;
        }
        if (post.url) {
            return post.url;
        }
        else {
            //generate it 
            return "https://instagram.com/p/" + post.post_id;
        }
    }
    if (post.platform === 'facebook') {
        if (post.original_url) {
            return post.original_url;
        }
        if (post.url) {
            return post.url;
        }
        else {
            //generate it 
            return "https://facebook.com/" + post.post_id;
        }
    }
    if (post.platform === 'x') {
        if (post.original_url) {
            return post.original_url;
        }
        if (post.url) {
            return post.url;
        }
        else {
            //generate it 
            return "https://x.com/i/status/" + post.post_id;
        }
    }
    return '#';
}

export default getPostLink;