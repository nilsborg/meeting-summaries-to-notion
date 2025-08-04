# New Rerun Functionality Summary

## What Was Added

I've added comprehensive rerun functionality to your transcription processing system. This allows you to easily reprocess any transcription file that may have failed previously or that you want to regenerate.

## New Files Created

### 1. `rerun.ts` - Main Rerun Script
- Processes specific transcription files by search pattern
- Lists recent files or previously failed files
- Interactive selection when multiple files match
- Full logging integration

### 2. `rerun.sh` - Shell Wrapper
- Simple executable wrapper for the TypeScript rerun script
- Usage: `./rerun.sh [options] [search_term]`

### 3. `find-by-date.ts` - Date-Based File Finder
- Find transcription files by specific dates or date ranges
- Support for various date formats
- Quick time-based filtering (today, yesterday, week, month)

### 4. `functions/logProcessedFile.ts` - Processing Logger
- Tracks all processing attempts (success and failure)
- Maintains `processed_files.json` log
- Provides utilities to query processing history

### 5. Updated `main.ts`
- Now logs all processing attempts
- Better error handling and tracking

## Key Features

### 🔍 **Flexible File Search**
```bash
./rerun.sh "20250127"           # All files from Jan 27
./rerun.sh "20250127 1502"      # Specific time
./rerun.sh "transcription"      # Any matching filename
```

### 📋 **File Listing Options**
```bash
./rerun.sh --list             # Recent files
./rerun.sh --failed           # Previously failed files
```

### 📅 **Date-Based Discovery**
```bash
deno run --allow-all find-by-date.ts --today
deno run --allow-all find-by-date.ts --week
deno run --allow-all find-by-date.ts 2025-01-20..2025-01-27
```

### 📊 **Processing History**
- Automatic logging of all processing attempts
- Track success/failure status
- Store Notion document URLs for successful runs
- Easy identification of files that need reprocessing

### 🎯 **Interactive Selection**
When multiple files match your search, you get a numbered list to choose from:
```
Found 3 matching files:
1. 20250127 1502 Transcription.txt
2. 20250127 1515 Transcription.txt  
3. 20250127 1530 Transcription.txt

Enter the number (1-3) to process, or press Enter to cancel:
```

## Quick Start Examples

### Most Common Use Cases

1. **Reprocess a failed file from today:**
   ```bash
   ./rerun.sh --failed
   # Then pick the file from the list
   ```

2. **Reprocess a specific meeting:**
   ```bash
   ./rerun.sh "20250127 1502"
   ```

3. **See what files are available:**
   ```bash
   ./rerun.sh --list
   ```

4. **Find files from last week:**
   ```bash
   deno run --allow-all find-by-date.ts --week
   ```

## Benefits

✅ **Recovery from Failures** - Easily retry failed processing attempts  
✅ **Selective Processing** - Choose exactly which file to reprocess  
✅ **Progress Tracking** - Know what's been processed and what failed  
✅ **Time-Based Discovery** - Find files by date without browsing directories  
✅ **Interactive Interface** - User-friendly selection when multiple matches  
✅ **Complete Logging** - Full audit trail of all processing attempts  

## Integration

The new functionality integrates seamlessly with your existing workflow:
- Your main `./run.sh` script works exactly as before
- New rerun functionality is completely separate and optional
- All processing (main and rerun) now logs to the same tracking system
- No changes needed to your existing Notion setup or environment variables

## File Locations

All transcription files remain in `/Users/nilsborg/Transscripts/source/`  
Processing log is stored in `/Users/nilsborg/Transscripts/processed_files.json`  
All scripts are in the main project directory for easy access.