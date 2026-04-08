'use client'

import { useState, useEffect, useTransition } from 'react'
import {
    get_research_projects,
    create_research_project,
    delete_research_project,
    add_keyword_to_project,
    remove_keyword_from_project,
    add_profile_to_project,
    remove_profile_from_project
} from '@/app/(dashboard)/configurations/ResearchAction'
import { Search, Plus, Trash2, Globe, Hash, Eye, Loader2, FileText, ChevronDown, CheckCircle2, AlertCircle, X, FolderGit2, Layers, Tag, ExternalLink } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export default function ResearchSection({ project }) {
    const [projects, setProjects] = useState([])
    const [fetchLoading, setFetchLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState(null)

    // Form states for creating project
    const [newTitle, setNewTitle] = useState('')
    const [newDescription, setNewDescription] = useState('')

    // Form states for keywords/profiles per project
    const [keywordInputs, setKeywordInputs] = useState({})
    const [keywordPriorities, setKeywordPriorities] = useState({}) // High priority? true/false
    const [profileInputs, setProfileInputs] = useState({})

    const projectDb = project?.mongo_db_map

    const showFeedback = (type, message) => {
        setFeedback({ type, message })
        setTimeout(() => setFeedback(null), 3000)
    }

    const fetchProjects = async () => {
        if (!projectDb) return
        setFetchLoading(true)
        try {
            const res = await get_research_projects(projectDb)
            if (res.projects) {
                setProjects(res.projects)
            }
        } catch (e) {
            console.error(e)
            showFeedback('error', 'Failed to load research projects')
        } finally {
            setFetchLoading(false)
        }
    }

    useEffect(() => {
        fetchProjects()
    }, [projectDb])

    const handleCreateProject = () => {
        if (!newTitle.trim()) return
        startTransition(async () => {
            const res = await create_research_project(projectDb, newTitle, newDescription)
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Research project created')
                setNewTitle('')
                setNewDescription('')
                fetchProjects()
            }
        })
    }

    const handleDeleteProject = (projectId) => {
        if (!confirm('Are you sure you want to delete this research project?')) return
        startTransition(async () => {
            const res = await delete_research_project(projectDb, projectId)
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Project deleted')
                fetchProjects()
            }
        })
    }

    const handleAddKeyword = (projectId) => {
        const keyword = keywordInputs[projectId]
        if (!keyword?.trim()) return
        
        const isHigh = keywordPriorities[projectId] ?? true
        
        startTransition(async () => {
            const res = await add_keyword_to_project(projectDb, projectId, keyword, isHigh ? 'high' : 'low')
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Keyword added')
                setKeywordInputs(prev => ({ ...prev, [projectId]: '' }))
                fetchProjects()
            }
        })
    }

    const handleRemoveKeyword = (projectId, keyword) => {
        startTransition(async () => {
            const res = await remove_keyword_from_project(projectDb, projectId, keyword)
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Keyword removed')
                fetchProjects()
            }
        })
    }

    const handleAddProfile = (projectId) => {
        const url = profileInputs[projectId]
        if (!url?.trim()) return
        
        startTransition(async () => {
            const res = await add_profile_to_project(projectDb, projectId, url)
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Profile added')
                setProfileInputs(prev => ({ ...prev, [projectId]: '' }))
                fetchProjects()
            }
        })
    }

    const handleRemoveProfile = (projectId, url) => {
        startTransition(async () => {
            const res = await remove_profile_from_project(projectDb, projectId, url)
            if (res.error) {
                showFeedback('error', res.error)
            } else {
                showFeedback('success', 'Profile removed')
                fetchProjects()
            }
        })
    }

    return (
        <div className="space-y-8 w-full max-w-5xl mx-auto">
            <div className="flex items-center gap-3 px-1 border-b border-slate-100 pb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Layers className="w-4 h-4" />
                </div>
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-800">Research Projects</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Manage topics, keywords, and profiles for intelligence gathering</p>
                </div>
            </div>

            {/* Feedback Alert */}
            {feedback && (
                <div className={cn(
                    "flex items-center gap-3 p-4 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 shadow-sm",
                    feedback.type === 'error' ? "bg-red-50 text-red-700 border border-red-100/50" : "bg-emerald-50 text-emerald-700 border border-emerald-100/50"
                )}>
                    {feedback.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    {feedback.message}
                </div>
            )}

            {/* Create Project Card */}
            <Card className="border-slate-200/60 shadow-sm rounded-2xl overflow-hidden bg-white/50 backdrop-blur-sm transition-all hover:shadow-md">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100/60 pt-6 pb-5 px-5 md:px-8">
                    <CardTitle className="text-lg font-semibold tracking-tight text-slate-800 flex items-center gap-2">
                        <FolderGit2 className="w-5 h-5 text-blue-600" />
                        Create New Project
                    </CardTitle>
                    <CardDescription className="text-slate-500 mt-1.5 text-sm">
                        Define a new topic or event to group related keywords and profiles.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-5 md:p-8 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-2.5">
                            <label className="text-sm font-semibold text-slate-700">Project Title</label>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g. Election Disinformation"
                                className={cn(
                                    "w-full h-12 px-4 text-base md:text-sm font-medium rounded-xl border border-slate-200",
                                    "bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                )}
                            />
                        </div>
                        <div className="space-y-2.5">
                            <label className="text-sm font-semibold text-slate-700">Description (Optional)</label>
                            <input
                                type="text"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="Brief summary of the research goal..."
                                className={cn(
                                    "w-full h-12 px-4 text-base md:text-sm font-medium rounded-xl border border-slate-200",
                                    "bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                )}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button 
                            onClick={handleCreateProject}
                            disabled={isPending || !newTitle.trim()}
                            className="h-11 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-all"
                        >
                            {isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Plus className="w-5 h-5 mr-2" />}
                            Create Project
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Projects List */}
            {fetchLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 text-blue-600/50 animate-spin" />
                </div>
            ) : projects.length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mx-auto mb-4">
                        <FileText className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-1">No Projects Found</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">Create your first research project above to start tracking keywords and profiles.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    <Accordion type="single" collapsible className="w-full space-y-4">
                        {projects.map((proj) => (
                            <AccordionItem value={proj._id} key={proj._id} className="border border-slate-200/60 rounded-2xl bg-white overflow-hidden shadow-sm px-0 transition-all hover:shadow-md hover:border-slate-300/80 data-[state=open]:border-blue-200 data-[state=open]:ring-1 data-[state=open]:ring-blue-500/10">
                                <AccordionTrigger className="hover:no-underline hover:bg-slate-50/50 px-5 py-5 md:px-8 md:py-6 group">
                                    <div className="flex flex-col items-start gap-1.5 text-left w-full">
                                        <div className="flex flex-wrap items-center gap-3 w-full pr-4">
                                            <h3 className="text-lg font-bold tracking-tight text-slate-800 group-hover:text-blue-700 transition-colors">{proj.title}</h3>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent text-xs font-semibold px-2 py-0.5">
                                                    {proj.keywords?.length || 0} keywords
                                                </Badge>
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 border-transparent text-xs font-semibold px-2 py-0.5">
                                                    {proj.profiles?.length || 0} profiles
                                                </Badge>
                                            </div>
                                        </div>
                                        {proj.description && (
                                            <p className="text-sm text-slate-500 line-clamp-2 md:line-clamp-1 pr-4">{proj.description}</p>
                                        )}
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="border-t border-slate-100 p-5 md:p-8 space-y-10 bg-slate-50/30">
                                    
                                    {/* Keywords Section */}
                                    <div className="space-y-5">
                                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-blue-100/50 flex items-center justify-center">
                                                    <Tag className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <h4 className="text-base font-semibold tracking-tight text-slate-800">Tracked Keywords</h4>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col md:flex-row items-center gap-3">
                                            <div className="relative flex-1 w-full group">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={keywordInputs[proj._id] || ''}
                                                    onChange={(e) => setKeywordInputs(prev => ({ ...prev, [proj._id]: e.target.value }))}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword(proj._id)}
                                                    placeholder="Add a new keyword..."
                                                    className={cn(
                                                        "w-full h-12 pl-10 pr-4 text-base md:text-sm font-medium rounded-xl border border-slate-200",
                                                        "bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                                    )}
                                                />
                                            </div>
                                            <div className="flex items-center gap-3 w-full md:w-auto">
                                                <div className="flex items-center gap-2.5 px-4 h-12 bg-white border border-slate-200 rounded-xl shadow-sm transition-colors hover:border-slate-300">
                                                    <Switch 
                                                        id={`priority-${proj._id}`}
                                                        checked={keywordPriorities[proj._id] ?? true}
                                                        onCheckedChange={(c) => setKeywordPriorities(prev => ({ ...prev, [proj._id]: c }))}
                                                    />
                                                    <label htmlFor={`priority-${proj._id}`} className="text-sm font-semibold text-slate-700 whitespace-nowrap cursor-pointer select-none">
                                                        High Priority
                                                    </label>
                                                </div>
                                                <Button 
                                                    variant="outline"
                                                    onClick={() => handleAddKeyword(proj._id)}
                                                    disabled={isPending || !keywordInputs[proj._id]?.trim()}
                                                    className="h-12 px-6 bg-white border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:text-blue-600 rounded-xl shrink-0 shadow-sm"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </div>

                                        {proj.keywords && proj.keywords.length > 0 && (
                                            <div className="flex flex-wrap gap-2.5 pt-2">
                                                {proj.keywords.map((kw, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className={cn(
                                                            "group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-sm font-medium rounded-lg border transition-all",
                                                            kw.priority === 'high' 
                                                                ? "bg-red-50/50 text-red-700 border-red-200 hover:bg-red-100/50 hover:border-red-300" 
                                                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm"
                                                        )}
                                                    >
                                                        {kw.priority === 'high' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                                        <span>{kw.keyword}</span>
                                                        <button 
                                                            onClick={() => handleRemoveKeyword(proj._id, kw.keyword)}
                                                            className={cn(
                                                                "ml-1 p-1 rounded-md opacity-50 hover:opacity-100 transition-all",
                                                                kw.priority === 'high' ? "hover:bg-red-200 text-red-700" : "hover:bg-slate-200 text-slate-600"
                                                            )}
                                                            aria-label="Remove keyword"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Profiles Section */}
                                    <div className="space-y-5">
                                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-blue-100/50 flex items-center justify-center">
                                                    <Globe className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <h4 className="text-base font-semibold tracking-tight text-slate-800">Monitored Profiles</h4>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col md:flex-row items-center gap-3">
                                            <div className="relative flex-1 w-full group">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <ExternalLink className="h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={profileInputs[proj._id] || ''}
                                                    onChange={(e) => setProfileInputs(prev => ({ ...prev, [proj._id]: e.target.value }))}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddProfile(proj._id)}
                                                    placeholder="Add profile URL (e.g., https://instagram.com/username)"
                                                    className={cn(
                                                        "w-full h-12 pl-10 pr-4 text-base md:text-sm font-medium rounded-xl border border-slate-200",
                                                        "bg-white shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                                                    )}
                                                />
                                            </div>
                                            <Button 
                                                variant="outline"
                                                onClick={() => handleAddProfile(proj._id)}
                                                disabled={isPending || !profileInputs[proj._id]?.trim()}
                                                className="h-12 px-6 bg-white border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 hover:text-blue-600 rounded-xl shrink-0 shadow-sm w-full md:w-auto"
                                            >
                                                Add Profile
                                            </Button>
                                        </div>

                                        {proj.profiles && proj.profiles.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                                {proj.profiles.map((prof, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm group hover:border-blue-200 hover:shadow-md transition-all">
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                                                                <Globe className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                                                            </div>
                                                            <a 
                                                                href={prof.url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                className="text-sm font-medium text-slate-600 hover:text-blue-600 truncate transition-colors"
                                                            >
                                                                {prof.url}
                                                            </a>
                                                        </div>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon"
                                                            onClick={() => handleRemoveProfile(proj._id, prof.url)}
                                                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-8 mt-8 border-t border-slate-200/60 flex justify-end">
                                        <Button 
                                            variant="outline" 
                                            onClick={() => handleDeleteProject(proj._id)}
                                            className="h-11 px-5 text-red-600 font-semibold hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300 rounded-xl transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete Project
                                        </Button>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </div>
    )
}
