import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Resume from '../models/Resume.js';

const clampScore = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const normalizeKeywords = (keywords) => {
    if (Array.isArray(keywords)) {
        return keywords
            .map((item) => String(item || '').trim())
            .filter(Boolean);
    }

    if (typeof keywords === 'string') {
        return keywords
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
};

const buildResumeText = (resume) => {
    let resumeText = '';

    if (resume.profileInfo) {
        resumeText += `Name: ${resume.profileInfo.fullName || ''}\n`;
        resumeText += `Designation: ${resume.profileInfo.designation || ''}\n`;
        resumeText += `Summary: ${resume.profileInfo.summary || ''}\n\n`;
    }

    if (resume.contactInfo) {
        resumeText += `Contact: ${resume.contactInfo.email || ''}, ${resume.contactInfo.phone || ''}\n\n`;
    }

    if (Array.isArray(resume.workExperience) && resume.workExperience.length > 0) {
        resumeText += 'Work Experience:\n';
        resume.workExperience.forEach((exp) => {
            resumeText += `- ${exp.role || ''} at ${exp.company || ''} (${exp.startDate || ''} - ${exp.endDate || ''}): ${exp.description || ''}\n`;
        });
        resumeText += '\n';
    }

    if (Array.isArray(resume.education) && resume.education.length > 0) {
        resumeText += 'Education:\n';
        resume.education.forEach((edu) => {
            resumeText += `- ${edu.degree || ''} from ${edu.institution || ''} (${edu.startDate || ''} - ${edu.endDate || ''})\n`;
        });
        resumeText += '\n';
    }

    if (Array.isArray(resume.skills) && resume.skills.length > 0) {
        resumeText += 'Skills:\n';
        resume.skills.forEach((skill) => {
            resumeText += `- ${skill.name || ''}\n`;
        });
        resumeText += '\n';
    }

    if (Array.isArray(resume.projects) && resume.projects.length > 0) {
        resumeText += 'Projects:\n';
        resume.projects.forEach((proj) => {
            resumeText += `- ${proj.title || ''}: ${proj.description || ''} (${proj.github || ''}, ${proj.liveDemo || ''})\n`;
        });
        resumeText += '\n';
    }

    return resumeText.trim();
};

const sanitizeATSResult = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return null;

    const score = clampScore(parsed.score);
    const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
    const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
        : [];

    if (score === null || !feedback) return null;
    return { score, feedback, suggestions };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const calculateHeuristicATS = ({ resumeText, jobTitle, jobDescription, keywords }) => {
    const normalizedResume = String(resumeText || '').toLowerCase();
    const normalizedJobText = `${jobTitle || ''} ${jobDescription || ''}`.toLowerCase();

    const explicitKeywords = normalizeKeywords(keywords).map((k) => k.toLowerCase());
    const inferredKeywords = normalizedJobText
        .split(/[^a-z0-9+#.]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .slice(0, 30);
    const targetKeywords = Array.from(new Set([...explicitKeywords, ...inferredKeywords])).slice(0, 25);

    const matched = targetKeywords.filter((keyword) => {
        const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
        return pattern.test(normalizedResume);
    });

    const keywordScore = targetKeywords.length > 0
        ? Math.round((matched.length / targetKeywords.length) * 100)
        : 55;

    const sectionSignals = [
        /work experience/i,
        /education/i,
        /skills/i,
        /projects/i,
    ];
    const sectionsPresent = sectionSignals.filter((signal) => signal.test(resumeText)).length;
    const structureScore = Math.round((sectionsPresent / sectionSignals.length) * 100);

    const score = Math.max(35, Math.min(95, Math.round((keywordScore * 0.7) + (structureScore * 0.3))));

    const missingKeywords = targetKeywords.filter((k) => !matched.includes(k)).slice(0, 3);
    const suggestions = [];
    if (missingKeywords.length > 0) {
        suggestions.push(`Add these keywords if relevant: ${missingKeywords.join(', ')}.`);
    }
    if (sectionsPresent < 3) {
        suggestions.push('Use clear headings like Work Experience, Skills, Projects, and Education.');
    }
    suggestions.push('Quantify achievements with numbers (%, revenue, users, performance).');

    return {
        score,
        feedback: `Estimated ATS match based on keyword coverage and resume structure. Matched ${matched.length} of ${targetKeywords.length || 0} target keywords.`,
        suggestions: suggestions.slice(0, 3),
    };
};

const withTimeout = async (promise, timeoutMs) => {
    let timeoutHandle;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutHandle);
    }
};

const isModelNotFoundError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('not found') || message.includes('not supported');
};

const isRateLimitError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('429') || message.includes('too many requests');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractJSON = (text) => {
    const cleaned = String(text || '').trim();
    if (!cleaned) return null;

    try {
        const parsed = JSON.parse(cleaned);
        const valid = sanitizeATSResult(parsed);
        if (valid) return valid;
    } catch {
        // Ignore and try alternate extraction strategies.
    }

    const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch) {
        try {
            const parsed = JSON.parse(fencedMatch[1]);
            const valid = sanitizeATSResult(parsed);
            if (valid) return valid;
        } catch {
            // Ignore and use bracket fallback.
        }
    }

    const firstOpen = cleaned.indexOf('{');
    const lastClose = cleaned.lastIndexOf('}');
    if (firstOpen === -1 || lastClose === -1 || firstOpen >= lastClose) {
        return null;
    }

    try {
        const parsed = JSON.parse(cleaned.slice(firstOpen, lastClose + 1));
        return sanitizeATSResult(parsed);
    } catch {
        return null;
    }
};

export const createResume = async (req, res) => {
    try {
        const { title } = req.body;

        // Default template
        const defaultResumeData = {
            profileInfo: {
                profileImg: null,
                previewUrl: '',
                fullName: '',
                designation: '',
                summary: '',
            },
            contactInfo: {
                email: '',
                phone: '',
                location: '',
                linkedin: '',
                github: '',
                website: '',
            },
            workExperience: [
                {
                    company: '',
                    role: '',
                    startDate: '',
                    endDate: '',
                    description: '',
                },
            ],
            education: [
                {
                    degree: '',
                    institution: '',
                    startDate: '',
                    endDate: '',
                },
            ],
            skills: [
                {
                    name: '',
                    progress: 0,
                },
            ],
            projects: [
                {
                    title: '',
                    description: '',
                    github: '',
                    liveDemo: '',
                },
            ],
            certifications: [
                {
                    title: '',
                    issuer: '',
                    year: '',
                },
            ],
            languages: [
                {
                    name: '',
                    progress: '',
                },
            ],
            interests: [''],
        };

        const newResume = await Resume.create({
            userId: req.user._id,
            title,
            ...defaultResumeData,
        });

        res.status(201).json(newResume);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create resume', error: error.message });
    }
};

export const getUserResumes = async (req, res) => {
    try {
        const resumes = await Resume.find({ userId: req.user._id }).sort({
            updatedAt: -1,
        });
        res.json(resumes);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get resumes', error: error.message });
    }
};

export const getResumeById = async (req, res) => {
    try {
        const resume = await Resume.findOne({ _id: req.params.id, userId: req.user._id });

        if (!resume) {
            return res.status(404).json({ message: 'Resume not found' });
        }
        res.json(resume);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get resume', error: error.message });
    }
};

export const updateResume = async (req, res) => {
    try {
        const resume = await Resume.findOne({
            _id: req.params.id,
            userId: req.user._id,
        });
        if (!resume) {
            return res.status(404).json({ message: 'Resume not found or unauthorized' });
        }

        // Merge updates from req.body into existing resume
        Object.assign(resume, req.body);

        // Save updated resume
        const savedResume = await resume.save();
        res.json(savedResume);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update resume', error: error.message });
    }
};

export const deleteResume = async (req, res) => {
    try {
        const resume = await Resume.findOne({
            _id: req.params.id,
            userId: req.user._id,
        });

        if (!resume) {
            return res.status(404).json({ message: 'Resume not found or unauthorized' });
        }

        // Folder where uploads are stored
        const uploadsFolder = path.join(process.cwd(), 'uploads');

        // Delete thumbnail image
        if (resume.thumbnailLink) {
            const oldThumbnail = path.join(uploadsFolder, path.basename(resume.thumbnailLink));
            if (fs.existsSync(oldThumbnail)) {
                fs.unlinkSync(oldThumbnail);
            }
        }

        // Delete profile preview image
        if (resume.profileInfo?.profilePreviewUrl) {
            const oldProfile = path.join(
                uploadsFolder,
                path.basename(resume.profileInfo.profilePreviewUrl)
            );
            if (fs.existsSync(oldProfile)) {
                fs.unlinkSync(oldProfile);
            }
        }

        // Delete the resume document
        const deleted = await Resume.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id,
        });

        if (!deleted) {
            return res.status(404).json({ message: 'Resume not found or unauthorized' });
        }

        res.json({ message: 'Resume deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete resume', error: error.message });
    }
};

export const getATSScore = async (req, res) => {
    console.log('[ATS] request received');
    console.log('[ATS] user id:', req.user?._id);
    console.log('[ATS] resume id:', req.params.id);
    const { jobTitle = '', jobDescription = '' } = req.body || {};
    const keywords = normalizeKeywords(req.body?.keywords);
    const emergencyFallback = calculateHeuristicATS({
        resumeText: '',
        jobTitle,
        jobDescription,
        keywords,
    });

    try {
        const { id } = req.params;

        if (!req.user?._id) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid resume id.' });
        }

        if (!jobTitle.trim() && !jobDescription.trim() && keywords.length === 0) {
            return res.status(400).json({
                message: 'Provide at least one of jobTitle, jobDescription, or keywords.',
            });
        }

        const resume = await Resume.findOne({ _id: id, userId: req.user._id });
        console.log('[ATS] resume found:', !!resume);

        if (!resume) {
            return res.status(404).json({ message: 'Resume not found' });
        }

        const resumeText = buildResumeText(resume);
        const jobInfo = `Job Title: ${jobTitle}\nJob Description: ${jobDescription}\nKeywords: ${keywords.join(', ')}`;
        const heuristic = calculateHeuristicATS({
            resumeText,
            jobTitle,
            jobDescription,
            keywords,
        });

        const prompt = `You are an ATS (Applicant Tracking System) expert. Analyze the provided resume against the job profile and provide an ATS compatibility score.

IMPORTANT: Always respond with valid JSON only. No additional text, explanations, or formatting outside the JSON.

Resume Data:
${resumeText}

Job Profile:
${jobInfo}

Instructions:
- Score from 0-100 based on keyword matching, formatting, structure, and ATS-friendliness
- Even if resume data is incomplete or poorly formatted, provide a reasonable score
- Focus on: keyword relevance, clear sections, standard formatting, quantifiable achievements

Response format (JSON only):
{
  "score": 85,
  "feedback": "Brief summary of strengths and weaknesses",
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}`;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('[ATS] GEMINI_API_KEY missing. Using heuristic fallback.');
            return res.json({
                ...heuristic,
                usedHeuristic: true,
                source: 'heuristic',
                modelUsed: null,
                fallbackReason: 'missing_api_key',
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const modelCandidates = Array.from(new Set([
            process.env.GEMINI_MODEL,
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-2.0-flash',
            'gemini-2.0-flash-001',
            'gemini-2.0-flash-lite-001',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
        ].filter(Boolean)));

        let result = null;
        let selectedModel = null;
        let lastModelError = null;
        try {
            for (const modelName of modelCandidates) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    for (let attempt = 1; attempt <= 2; attempt += 1) {
                        try {
                            console.log(`[ATS] calling Gemini API with model: ${modelName} (attempt ${attempt})`);
                            result = await model.generateContent(prompt);
                            selectedModel = modelName;
                            console.log(`[ATS] Gemini response received from model: ${modelName}`);
                            break;
                        } catch (attemptError) {
                            lastModelError = attemptError;
                            if (attempt < 2 && isRateLimitError(attemptError)) {
                                await sleep(1200);
                                continue;
                            }
                            throw attemptError;
                        }
                    }
                    if (result) break;
                } catch (modelError) {
                    lastModelError = modelError;
                    if (isModelNotFoundError(modelError)) {
                        console.warn(`[ATS] model unavailable: ${modelName}`);
                        continue;
                    }
                    throw modelError;
                }
            }
            if (!result) {
                throw lastModelError || new Error('No Gemini model succeeded.');
            }
        } catch (geminiError) {
            console.error('[ATS] Gemini API call failed:', geminiError?.message || geminiError);
            console.warn('[ATS] Using heuristic fallback due to Gemini failure.');
            return res.json({
                ...heuristic,
                usedHeuristic: true,
                source: 'heuristic',
                modelUsed: selectedModel,
                fallbackReason: isRateLimitError(geminiError) ? 'rate_limited_or_quota' : 'gemini_request_failed',
            });
        }

        const response = await result.response;
        const text = await response.text();
        const parsed = extractJSON(text);

        if (!parsed) {
            console.error('[ATS] parse error: invalid JSON response');
            console.warn('[ATS] Using heuristic fallback due to invalid Gemini output.');
            return res.json({
                ...heuristic,
                usedHeuristic: true,
                source: 'heuristic',
                modelUsed: selectedModel,
                fallbackReason: 'invalid_model_json',
            });
        }

        res.json({
            ...parsed,
            usedHeuristic: false,
            source: 'gemini',
            modelUsed: selectedModel,
            fallbackReason: null,
        });
    } catch (error) {
        console.error('[ATS] failed to get score:', error?.message || error);
        console.error('[ATS] stack:', error?.stack || 'no-stack');
        console.warn('[ATS] Using emergency heuristic fallback due to internal error.');
        return res.json({
            ...emergencyFallback,
            usedHeuristic: true,
            source: 'heuristic',
            modelUsed: null,
            fallbackReason: 'internal_error',
            feedback: 'ATS service had an internal issue and returned a safe fallback score.',
            suggestions: [
                ...(Array.isArray(emergencyFallback.suggestions) ? emergencyFallback.suggestions : []),
                'Try again after refreshing if you recently updated backend code.',
            ].slice(0, 4),
        });
    }
};
