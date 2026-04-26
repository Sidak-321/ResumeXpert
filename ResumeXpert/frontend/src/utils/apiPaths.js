export const LOCAL_BASE_URL = "http://localhost:4000";
export const RENDER_BASE_URL = "https://resumexpert-backend-3epu.onrender.com";

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || LOCAL_BASE_URL;
export const FALLBACK_BASE_URL = import.meta.env.VITE_API_FALLBACK_BASE_URL || LOCAL_BASE_URL;

// utils/apiPath.js
export const API_PATHS = {

    AUTH: {
        REGISTER: "/api/auth/register",
        LOGIN: "/api/auth/login",
        GET_PROFILE: "/api/auth/profile",
    },
    RESUME: {
        CREATE: "/api/resume",
        GET_ALL: "/api/resume",
        GET_BY_ID: (id) => `/api/resume/${id}`,
        UPDATE: (id) => `/api/resume/${id}`,
        DELETE: (id) => `/api/resume/${id}`,
        UPLOAD_IMAGES: (id) => `/api/resume/${id}/upload-images`,
        ATS_SCORE: (id) => `/api/resume/${id}/ats-score`,
    },
    image: {
        UPLOAD_IMAGE: "api/auth/upload-image",
    },
};