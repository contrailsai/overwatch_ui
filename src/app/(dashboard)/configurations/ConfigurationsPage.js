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
            <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full">
                <Tabs defaultValue="project" className="w-full space-y-6 md:space-y-8">
                    <TabsList className="flex w-full overflow-x-auto justify-start p-1 bg-slate-100 rounded-xl my-4 md:mt-0 md:mb-6 gap-2 md:grid md:grid-cols-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-2 md:px-1">
                        <TabsTrigger value="project" className="flex-none shrink-0 px-4 md:px-8 py-2.5 md:py-2 text-[13px] md:text-sm whitespace-nowrap rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center gap-2">
                            <Globe className="w-4 h-4 shrink-0" />
                            Project Settings
                        </TabsTrigger>
                        <TabsTrigger value="account" className="flex-none shrink-0 px-4 md:px-8 py-2.5 md:py-2 text-[13px] md:text-sm whitespace-nowrap rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center gap-2">
                            <Settings className="w-4 h-4 shrink-0" />
                            User Account
                        </TabsTrigger>

                        <TabsTrigger value="keywords" className="flex-none shrink-0 px-4 md:px-8 py-2.5 md:py-2 text-[13px] md:text-sm whitespace-nowrap rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center gap-2">
                            <Settings className="w-4 h-4 shrink-0" />
                            Project Keywords
                        </TabsTrigger>

                        <TabsTrigger value="watchlist" className="flex-none shrink-0 px-4 md:px-8 py-2.5 md:py-2 text-[13px] md:text-sm whitespace-nowrap rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center justify-center gap-2">
                            <Eye className="w-4 h-4 shrink-0" />
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