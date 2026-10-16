# Rental-management screenshot redaction

Updated: 2026-10-17.

## Scope and provenance

The user supplied four real backend screenshots for the reserved property-management
case and requested personal-data removal. Built-in image editing was used on each
supplied image; no invented backend was generated from scratch. Cropping, typography
and geometry can differ after image editing, so these are processed feature-display
images, not pixel-exact source screenshots or financial evidence.

Original attachments remain outside the repository and are never copied into public
assets, download bundles, documentation, or Git. No private backend URL is linked.

## Public assets

All files below are flattened, opaque lossless WebP images, re-encoded without EXIF,
XMP or IPTC metadata. Gray masks are baked into the pixels, not HTML/CSS overlays.
Only the redacted files are referenced by the gallery, image optimizer and downloads.

| View | Asset under `public/card/cases/` | Hidden values |
| --- | --- | --- |
| Overview | `rental-management-overview-redacted.webp` | Metrics, property identifiers, district/address details, rents |
| Tenancies | `rental-management-tenancies-redacted.webp` | Owner and tenant names, building names, units, lease dates, counts |
| Finance | `rental-management-finance-redacted.webp` | Financial metrics and table values, property and owner identifiers |
| Entrustments | `rental-management-entrustments-redacted.webp` | Property names, exact addresses, owners, room counts, numeric fee rates |

Non-identifying interface labels, management types and generic contract descriptions
remain visible. Every output was visually reviewed at original detail, including
partial bottom rows. The image metadata and alpha-channel checks also passed.
Visual inspection is a manual check, not an automated proof against all disclosures.
Future screenshot replacements must undergo the same review before publication.

PNG copies and a ZIP of the four redacted PNGs are saved in the ignored
`outputs/rental-redacted/` folder for the user. No raw originals are bundled.

## Editing prompts

Mode: built-in image editing, one referenced source image per call, opaque background.
The following prompts contain no actual personal values.

### Image 1

Edit target: the attached ORIGINAL rental-management screenshot, not a style reference. This is a privacy redaction task, not a redesign. Preserve all non-sensitive original UI, Chinese labels, icons, buttons, row geometry, colors and layout exactly. Do not invent, replace, improve, or reconstruct the interface or data. Cover private values with completely opaque flat medium-gray rectangles, never blur, pixelate, semi-transparent paint, abbreviations, initials, or substitute names. Cover every original character fully, including trailing digits and partial rows at image edges. Crop away the phone status bar, browser URL bar and any bottom browser/Gemini controls so only the original web app content remains. Do not add any text, extra components, frames, or watermarks. Output a flattened opaque image with no hidden original text or data. Screenshot 1 overview and opened management menu: mask all visible numeric metric/statistic values in the overview tiles, including secondary counts. Keep their generic labels. In the entire recent-property list, mask every full property title, room identifier, district/address detail and rental-money value on every visible row including the bottom partially visible row. Keep the list heading, management button, borders, and green availability badges. Preserve the opened management navigation menu and the business logo; those are not personal information.

### Image 2

Edit target: the attached ORIGINAL rental-management screenshot, not a style reference. This is a privacy redaction task, not a redesign. Preserve all non-sensitive original UI, Chinese labels, icons, buttons, row geometry, colors and layout exactly. Do not invent, replace, improve, or reconstruct the interface or data. Cover private values with completely opaque flat medium-gray rectangles, never blur, pixelate, semi-transparent paint, abbreviations, initials, or substitute names. Cover every original character fully, including trailing digits and partial rows at image edges. Crop away the phone status bar, browser URL bar and any bottom browser/Gemini controls so only the original web app content remains. Do not add any text, extra components, frames, or watermarks. Output a flattened opaque image with no hidden original text or data. Screenshot 2 tenancy table: fully mask the landlord's personal name after the landlord label, the building/property name with street/number in the green group header, every tenant name in the entire first column, every room/unit identifier in the second column, and every start/end lease date in the third column, including all partially visible bottom cells. Also mask numeric summary counts if any. Keep the generic table column headings, search/filter controls, buttons, icons, alternating rows and layout. No real personal name, street identifier, room code, or date should remain readable anywhere.

### Image 3

Edit target: the attached ORIGINAL rental-management screenshot, not a style reference. This is a privacy redaction task, not a redesign. Preserve all non-sensitive original UI, Chinese labels, icons, buttons, row geometry, colors and layout exactly. Do not invent, replace, improve, or reconstruct the interface or data. Cover private values with completely opaque flat medium-gray rectangles, never blur, pixelate, semi-transparent paint, abbreviations, initials, or substitute names. Cover every original character fully, including trailing digits and partial rows at image edges. Crop away the phone status bar, browser URL bar and any bottom browser/Gemini controls so only the original web app content remains. Do not add any text, extra components, frames, or watermarks. Output a flattened opaque image with no hidden original text or data. Screenshot 3 financial report: completely mask ALL actual numerical values in every metric tile, every NT$ amount including zeros, any small secondary line containing monetary numbers, the escrow/custody amount and settlement-return amount in the blue panel. In the entire lower property table, mask every full property/building title, every owner name, and ALL numbers in financial columns on every visible or partially visible row. Preserve generic labels, table headings, filters, buttons and explanatory text without actual values. Do not leave any real owner identifier, street number, amount, or partial number visible.

### Image 4

Edit target: the attached ORIGINAL rental-management screenshot, not a style reference. This is a privacy redaction task, not a redesign. Preserve all non-sensitive original UI, Chinese labels, icons, buttons, row geometry, colors and layout exactly. Do not invent, replace, improve, or reconstruct the interface or data. Cover private values with completely opaque flat medium-gray rectangles, never blur, pixelate, semi-transparent paint, abbreviations, initials, or substitute names. Cover every original character fully, including trailing digits and partial rows at image edges. Crop away the phone status bar, browser URL bar and any bottom browser/Gemini controls so only the original web app content remains. Do not add any text, extra components, frames, or watermarks. Output a flattened opaque image with no hidden original text or data. Screenshot 4 entrustment-list cards: on EVERY card including the partially visible bottom card, fully mask each complete property/building title, the entire exact address/secondary property identifier line, the full owner's personal name after its generic label, and the private room-count/contract-rate figures in the details line. Preserve generic labels where possible, the management-type badges, card borders and the three action buttons on each card, and the list heading/add button. Do not leave a real person name, exact address, property identifier or partial row exposed.

## Gallery checks

The case is labelled as redacted, with four selectable views. Keyboard arrow keys
cycle its images; header arrows still cycle cases. Switching cases resets the image
index. Downloads always point to the selected redacted asset. Closing restores focus
and background scrolling through the existing shared scroll-lock implementation.
The Playwright case suite checks these behaviors and all image loads at desktop and
mobile widths, plus emulated iOS Chrome and the installed WebKit engine.
