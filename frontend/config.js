// frontend/config.js
// Centralized configuration file for the entire application

const CONFIG = {
    // Server Configuration
    // UPDATE THESE URLS AFTER DEPLOYMENT
    SOCKET_URL: "http://localhost:3000",
    API_BASE_URL: "http://localhost:3000",
    GRAFANA_URL: "http://localhost:3001",
    
    // Professional Dark Theme Colors
    THEME: {
        // Dark backgrounds
        BG_PRIMARY: "#0F172A",        // Deep Navy
        BG_SECONDARY: "#1E293B",      // Slate
        BG_CARD: "#1E293B",
        
        // Accent colors - Modern Purple/Blue
        PRIMARY: "#6366F1",           // Indigo
        PRIMARY_DARK: "#4F46E5",
        PRIMARY_LIGHT: "#818CF8",
        
        SECONDARY: "#8B5CF6",         // Purple
        ACCENT: "#06B6D4",            // Cyan
        
        // Status colors
        SUCCESS: "#10B981",           // Green
        ERROR: "#EF4444",             // Red
        WARNING: "#F59E0B",           // Amber
        
        // Text colors
        TEXT_PRIMARY: "#F1F5F9",      // Light slate
        TEXT_SECONDARY: "#94A3B8",    // Muted slate
        TEXT_MUTED: "#64748B",
        
        // Border colors
        BORDER: "#334155",
        BORDER_LIGHT: "#475569"
    },
    
    // Feature Flags
    FEATURES: {
        ENABLE_NOTIFICATIONS: true,
        ENABLE_SOUND: false,
        AUTO_ADVANCE_QUESTIONS: true,
        SHOW_PROGRESS_BAR: true
    },
    
    // Quiz Settings
    QUIZ: {
        DEFAULT_TIME_PER_QUESTION: 30,
        AUTO_SUBMIT_DELAY: 1500,
        NOTIFICATION_DURATION: 10000
    }
};

// Freeze the config
Object.freeze(CONFIG);
Object.freeze(CONFIG.THEME);
Object.freeze(CONFIG.FEATURES);
Object.freeze(CONFIG.QUIZ);