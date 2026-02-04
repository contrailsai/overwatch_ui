/**
 * Sends a notification to Slack via a simple GET request
 */
export async function sendSlackNotification() {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
        console.warn('SLACK_WEBHOOK_URL not configured')
        return
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'GET'
        })

        if (!response.ok) {
            console.error('Slack GET request failed:', response.statusText)
        }
        
        return response.ok
    } catch (err) {
        console.error('Failed to send Slack notification:', err)
        return false
    }
}
