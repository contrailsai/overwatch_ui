import React from 'react'
import { Document } from '@react-pdf/renderer'
import { registerFonts } from './fontRegistration'
import { SingleDomainPages } from './SingleDomainReport'

registerFonts()

/** Concatenated detailed domain report: one dossier+evidence block per domain. */
export function DetailedDomainsReportDocument({ domains, posts, project, compressedImages }) {
  const list = domains || posts || []
  return (
    <Document title="Detailed_Domain_Report">
      {list.map((domain, index) => (
        <SingleDomainPages
          key={domain._id || index}
          domain={domain}
          project={project}
          compressedImage={compressedImages?.[index]}
        />
      ))}
    </Document>
  )
}

export default DetailedDomainsReportDocument
