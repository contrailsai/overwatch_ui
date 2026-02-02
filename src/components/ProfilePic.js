export default function ProfilePic({ user, size = 24 }) {
    const getInitials = (name) => {
        if (!name) return '?'
        return name
            .split(/[\s._]+/) // Split by space, dot, or underscore
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
    }

    const getBackgroundColor = (name) => {
        if (!name) return 'bg-gray-400'
        const colors = [
            'bg-red-300',
            'bg-orange-300',
            'bg-amber-300',
            'bg-green-300',
            'bg-emerald-300',
            'bg-teal-300',
            'bg-cyan-300',
            'bg-blue-300',
            'bg-indigo-300',
            'bg-violet-300',
            'bg-purple-300',
            'bg-fuchsia-300',
            'bg-pink-300',
            'bg-rose-300',
        ]
        let hash = 0
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash)
        }
        const index = Math.abs(hash) % colors.length
        return colors[index]
    }

    const initials = getInitials(user)
    const bgColor = getBackgroundColor(user)

    return (
        <div
            className={`rounded-full flex items-center justify-center text-white font-medium text-xs select-none shrink-0 ${bgColor}`}
            style={{
                width: size,
                height: size,
                minWidth: size,
                minHeight: size,
            }}
        >
            {initials}
        </div>
    )
}