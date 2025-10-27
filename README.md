# Meeting Transcriptions to Notion

This project automatically processes meeting transcription files, summarizes them using configurable OpenRouter models (Claude by default), and creates organized meeting notes in Notion complete with the original transcript attached for download.

## Overview

The system:
1. Monitors transcription files in the `source/` directory
2. Processes the latest transcription file automatically
3. Generates a summary via OpenRouter for each configured model (Claude by default)
4. Creates well-formatted meeting notes in your Notion database and attaches the full transcript as a downloadable file
5. Tracks processing results and provides tools for reprocessing failed files

## Setup

### Prerequisites
- [Deno](https://deno.land/) installed
- Notion account with API access
- OpenRouter account with an API key (grants access to the models you want to use)

### Environment Variables
Create a `.env` file in the project root:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
NOTION_API_KEY=your_notion_api_key_here
NOTION_MEETING_DATABASE_ID=your_meeting_minutes_database_id_here
NOTION_USER_ID=your_notion_user_id_here
NOTION_PROJECT_UPDATES_DATABASE_ID=your_project_updates_database_id_here # required for project-updates flow
```

Both flows currently use the same summary model (Claude). To tweak them, edit `FLOW_CONFIGS` in `main.ts` and `rerun.ts`.

### File Structure
```
Transscripts/
├── source/                    # Place transcription files here
├── functions/                 # Core functionality modules
├── main.ts                   # Main processing script
├── rerun.ts                  # Reprocess specific transcriptions
├── find-by-date.ts          # Find files by date range
├── run.sh                   # Shell wrapper for main script
├── rerun.sh                 # Shell wrapper for rerun script
├── prompt.md                # Meeting notes prompt
├── project_updates_prompt.md # Project update prompt
├── processed_files.json     # Processing log (auto-generated)
└── .env                     # Environment variables
```

## Usage

### Automatic Processing
Process the latest transcription file:
```bash
./run.sh
# or
deno run --allow-all main.ts
```

### Selecting a Flow
```bash
# Default meeting notes flow
./run.sh meeting

# Project updates flow
./run.sh project-updates
```
`./run.sh` without arguments defaults to the meeting flow.

### Reprocessing Specific Files

#### View Help
```bash
./rerun.sh --help
# or
deno run --allow-all rerun.ts --help
```

#### List Recent Files
```bash
./rerun.sh --list
# Shows the 10 most recently created transcription files
```

#### List Failed Files
```bash
./rerun.sh --failed
# Shows files that failed to process previously
```

#### Reprocess by Search Term
```bash
# Process files from a specific date
./rerun.sh "20250127"

# Project update flow reprocessing
./rerun.sh --flow project-updates "20250127"

# Process a specific file by date and time
./rerun.sh "20250127 1502"

# Process any file containing "transcription"
./rerun.sh "transcription"
```

If multiple files match your search term, you'll be prompted to select which one to process.

### Finding Files by Date

Use the date finder utility to locate transcription files within specific time ranges:

```bash
# Show today's files
deno run --allow-all find-by-date.ts --today

# Show yesterday's files
deno run --allow-all find-by-date.ts --yesterday

# Show files from the last 7 days
deno run --allow-all find-by-date.ts --week

# Show files from the last 30 days
deno run --allow-all find-by-date.ts --month

# Show files from a specific date
deno run --allow-all find-by-date.ts 2025-01-27
deno run --allow-all find-by-date.ts 20250127

# Show files from a date range
deno run --allow-all find-by-date.ts 2025-01-20..2025-01-27
deno run --allow-all find-by-date.ts 20250120..20250127
```

## File Naming Convention

Transcription files should follow this naming pattern:
```
YYYYMMDD HHMM Transcription.txt
```

Examples:
- `20250127 1502 Transcription.txt`
- `20250128 0930 Transcription.txt`

## Processing Log

The system automatically maintains a log of processed files in `processed_files.json`. This includes:
- File path and name
- Processing timestamp
- Success/failure status
- Notion document URL (if successful)

This log enables:
- Tracking which files have been processed
- Identifying failed processing attempts
- Avoiding duplicate processing
- Quick access to generated Notion documents

## Error Handling

### Common Issues

1. **Missing Environment Variables**: Ensure all required API keys are set in `.env`
2. **File Not Found**: Check that transcription files are in the `source/` directory
3. **API Rate Limits**: The system will show appropriate error messages for API issues
4. **Invalid File Format**: Ensure transcription files are readable text files

### Recovery

If processing fails:
1. Check the error message in the console output
2. Use `./rerun.sh --failed` to see failed files
3. Fix any issues (API keys, file permissions, etc.)
4. Reprocess using `./rerun.sh "filename_pattern"`

## Customization

### Prompt Modification
Edit `prompt.md` to customize how each model summarizes your meetings. The prompt should include instructions for:
- Summary structure and format
- Key information to extract
- Tone and style preferences

### Notification Settings
The system uses macOS notifications. Modify the `showNotification` function in `functions/showNotification.ts` to customize notification behavior.

### Output Format
Modify the document title format in `main.ts` or `rerun.ts`:
```typescript
const documentTitle = "Meeting Notes - " + new Date().toLocaleDateString();
```

## Troubleshooting

### Permissions
If you get permission errors, ensure scripts are executable:
```bash
chmod +x run.sh rerun.sh
```

### Deno Permissions
The scripts require these Deno permissions:
- `--allow-read`: Read transcription files and configuration
- `--allow-write`: Write processing logs
- `--allow-net`: API calls to OpenRouter and Notion
- `--allow-env`: Access environment variables
- `--allow-run`: Execute notification commands

Using `--allow-all` grants all necessary permissions.

### API Issues
- **OpenRouter API**: Verify your API key has access to the requested models and sufficient credits
- **Notion API**: Ensure your Notion integration has access to the target database
- **Rate Limits**: The system will retry failed requests with appropriate delays

## Development

### Adding New Features
- Core processing logic is in `functions/` directory
- Main workflow is in `main.ts`
- Reprocessing logic is in `rerun.ts`
- Each function is modular and can be imported independently

### Testing
Test individual components:
```bash
# Test file discovery
deno run --allow-all -e "
import { getLatestFile } from './functions/getLatestFile.ts';
console.log(await getLatestFile('/Users/nilsborg/Transscripts/source'));
"

# Test prompt loading
deno run --allow-all -e "
import { loadPrompt } from './functions/loadPrompt.ts';
console.log(await loadPrompt('./prompt.md'));
"
```

## License

This project is for personal use. Ensure you comply with the terms of service for all integrated APIs (Anthropic, Notion, OpenAI).
