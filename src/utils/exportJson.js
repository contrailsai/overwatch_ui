import { format } from 'date-fns'

export const formatExportData = (post) => {
    const clonedPost = JSON.parse(JSON.stringify(post))

    delete clonedPost._id
    delete clonedPost.id
    delete clonedPost.code
    delete clonedPost.signedImageUrl

    return {
        "Case ID": post._id,
        ...clonedPost
    }
}

export const handleDownloadJSON = (post) => {
    try {
        const exportData = formatExportData(post)
        const jsonString = JSON.stringify([exportData], null, 2)
        const blob = new Blob([jsonString], { type: 'application/json' })

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')

        link.href = url
        link.setAttribute(
            'download',
            `case_${post._id}_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`
        )

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        URL.revokeObjectURL(url)
    } catch (error) {
        console.error('Download Error:', error)
        alert('Failed to download JSON. Please try again.')
    }
}