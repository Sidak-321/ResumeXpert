import express from "express";
import {
    createResume,
    getUserResumes,
    getResumeById,
    updateResume,
    deleteResume,
    getATSScore,
} from "../controllers/resumeController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { uploadResumeImages } from "../controllers/uploadImages.js";

const router = express.Router();

router.post("/", protect, createResume);
router.get("/", protect, getUserResumes);
router.get("/:id", protect, getResumeById);
router.put("/:id", protect, updateResume);
router.put("/:id/upload-images", protect, uploadResumeImages);

router.post("/:id/ats-score", protect, (req, res, next) => {
    console.log("[ATS] route hit:", req.params.id);
    next();
}, getATSScore);

router.delete("/:id", protect, deleteResume);

export default router;
