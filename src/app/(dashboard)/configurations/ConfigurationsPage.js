'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Globe, Eye } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import KeywordsSection from './KeywordsSection'
import WatchlistSection from './WatchlistSection'
import AccountSection from './AccountSection'
import ProjectSection from './ProjectSection'


export default function ConfigurationsPage({ clientDetails, project }) {
    const isEditable = project?.editable

    return (
        <main className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-50">
            {/* Header */}
            <PageHeader title="Configurations" description="Manage your account preferences and project-specific categorization rules" />

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 w-full">
                <Tabs defaultValue="project" className="w-full space-y-8">
                    <TabsList className="grid w-fit grid-cols-4 p-1 bg-slate-100 rounded-xl mb-6">
                        <TabsTrigger value="project" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Globe className="w-4 h-4 mr-2" />
                            Project Settings
                        </TabsTrigger>
                        <TabsTrigger value="account" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Settings className="w-4 h-4 mr-2" />
                            User Account
                        </TabsTrigger>

                        <TabsTrigger value="keywords" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Settings className="w-4 h-4 mr-2" />
                            Project Keywords
                        </TabsTrigger>

                        <TabsTrigger value="watchlist" className="px-8 py-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Eye className="w-4 h-4 mr-2" />
                            Profile Watchlist
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="keywords" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <KeywordsSection project={project} />
                    </TabsContent>

                    <TabsContent value="watchlist" className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <WatchlistSection project={project} />
                    </TabsContent>

                    {/* --- ACCOUNT TAB --- */}
                    <TabsContent value="account">
                        <AccountSection clientDetails={clientDetails} />
                    </TabsContent>

                    {/* --- PROJECT TAB --- */}
                    <TabsContent value="project">
                        <ProjectSection project={project} isEditable={isEditable} />
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    )
}