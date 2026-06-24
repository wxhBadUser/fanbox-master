# Mobile-QA1 Manual Real-Device Checklist

## Environment
- ADB: not available on this machine
- Real server: running on 4580, LAN URL http://192.168.31.45:4580/mobile
- Pairing: code not active (requires manual generation in FanBox desktop UI)

## Manual steps for real device validation

### 1. Generate pair code in FanBox desktop
   - Open FanBox desktop app
   - Go to Mobile/Safety settings
   - Click "Generate Pair Code" (or equivalent)
   - Note the 6-digit code

### 2. Open LAN URL on phone
   - Ensure phone is on same Wi-Fi as desktop
   - Open browser: http://192.168.31.45:4580/mobile
   - Verify pairing screen shows
   - Enter device name + 6-digit code
   - Click Pair

### 3. Verify Home
   - Connection status shows Connected
   - Desktop hostname shows
   - desktopContinuableAgents list shows running agents
   - mobileSessions list shows mobile drafts
   - recentFiles / usageSummary render

### 4. Verify Safety
   - Current device shows
   - 4 scope pills render (read:status, read:files, desktop_control, session:start)
   - Paired devices list shows this phone
   - Audit log shows entries WITHOUT initialMessage/follow-up raw text
   - No token/tokenHash visible

### 5. Verify Projects
   - Startable projects list shows
   - Each card shows canCreateSession + riskFlags
   - Click "新建任务" on a project → creates draft → enters session detail

### 6. Verify Files
   - Allowed roots list shows
   - Tap a directory → navigates into it
   - Tap a text file → preview opens (no horizontal overflow)
   - Search works
   - .env / .claude/projects / .codex/sessions return forbidden error

### 7. Verify Detail
   - Desktop agent timeline opens
   - Mobile session timeline opens
   - Draft Start button: enabled if session:start scope, disabled with reason otherwise
   - Follow-up input: enabled if desktop_control scope, hidden/disabled otherwise
   - After Start: timeline shows agent_start_requested → agent_started → agent_completed

### 8. Verify 401 handling
   - Clear token in desktop (revoke)
   - Phone should return to pairing screen on next API call

### 9. Verify no horizontal overflow
   - All pages at 390px width (iPhone 12/13/14)
   - No horizontal scrollbar

## Screenshots captured (test server)
- 01-real-pairing.png (REAL server 4580, unpaired)
- test-home.png (test server)
- test-safety.png (test server)
- test-projects.png (test server)
- test-files-roots.png (test server)
- test-file-preview.png (test server)
- test-detail.png (test server)
- test-start-timeline.png (test server)
- test-audit.png (test server)