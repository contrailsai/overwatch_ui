import { logActionError, logActionWarn, LOKI_STREAMS } from '@/utils/otel-logger'

/**
 * Sends a notification to Slack via a simple GET request
 */
export async function sendSlackNotification() {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (!webhookUrl) {
        logActionWarn({
            loki_stream: LOKI_STREAMS.shared,
            app_caller: 'slack',
            app_action: 'sendSlackNotification',
            message: 'SLACK_WEBHOOK_URL not configured',
        })
        console.warn('SLACK_WEBHOOK_URL not configured')
        return
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'GET'
        })

        if (!response.ok) {
            logActionError({
                loki_stream: LOKI_STREAMS.shared,
                app_caller: 'slack',
                app_action: 'sendSlackNotification',
                message: 'Slack GET request failed',
                status_text: response.statusText,
            })
            console.error('Slack GET request failed:', response.statusText)
        }
        
        return response.ok
    } catch (err) {
        logActionError({
            loki_stream: LOKI_STREAMS.shared,
            app_caller: 'slack',
            app_action: 'sendSlackNotification',
            message: 'Failed to send Slack notification',
        }, err)
        console.error('Failed to send Slack notification:', err)
        return false
    }
}
