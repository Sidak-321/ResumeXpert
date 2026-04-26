import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { API_PATHS } from '../utils/apiPaths';
import DashboardLayout from '../components/DashboardLayout';
import { LuCirclePlus, LuFilePlus, LuTrash2 } from 'react-icons/lu';
import moment from 'moment';
import { ResumeSummaryCard } from '../components/Cards';
import CreateResumeForm from '../components/CreateResumeForm';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';
import { dashboardStyles as styles } from '../assets/dummystyle';

const Dashboard = () => {
  const navigate = useNavigate();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [allResumes, setAllResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resumeToDelete, setResumeToDelete] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showATSModal, setShowATSModal] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState(null);
  const [atsForm, setAtsForm] = useState({ jobTitle: '', jobDescription: '', keywords: '' });
  const [atsResult, setAtsResult] = useState(null);
  const [loadingATS, setLoadingATS] = useState(false);

  useEffect(() => {
    window.scrollTo(0,0)
  },[])

  // Calculate completion percentage for a resume
  const calculateCompletion = (resume) => {
    let completedFields = 0;
    let totalFields = 0;

    // Profile Info
    totalFields += 3;
    if (resume.profileInfo?.fullName) completedFields++;
    if (resume.profileInfo?.designation) completedFields++;
    if (resume.profileInfo?.summary) completedFields++;

    // Contact Info
    totalFields += 2;
    if (resume.contactInfo?.email) completedFields++;
    if (resume.contactInfo?.phone) completedFields++;

    // Work Experience
    resume.workExperience?.forEach(exp => {
      totalFields += 5;
      if (exp.company) completedFields++;
      if (exp.role) completedFields++;
      if (exp.startDate) completedFields++;
      if (exp.endDate) completedFields++;
      if (exp.description) completedFields++;
    });

    // Education
    resume.education?.forEach(edu => {
      totalFields += 4;
      if (edu.degree) completedFields++;
      if (edu.institution) completedFields++;
      if (edu.startDate) completedFields++;
      if (edu.endDate) completedFields++;
    });

    // Skills
    resume.skills?.forEach(skill => {
      totalFields += 2;
      if (skill.name) completedFields++;
      if (skill.progress > 0) completedFields++;
    });

    // Projects
    resume.projects?.forEach(project => {
      totalFields += 4;
      if (project.title) completedFields++;
      if (project.description) completedFields++;
      if (project.github) completedFields++;
      if (project.liveDemo) completedFields++;
    });

    // Certifications
    resume.certifications?.forEach(cert => {
      totalFields += 3;
      if (cert.title) completedFields++;
      if (cert.issuer) completedFields++;
      if (cert.year) completedFields++;
    });

    // Languages
    resume.languages?.forEach(lang => {
      totalFields += 2;
      if (lang.name) completedFields++;
      if (lang.progress > 0) completedFields++;
    });

    // Interests
    totalFields += (resume.interests?.length || 0);
    completedFields += (resume.interests?.filter(i => i?.trim() !== "")?.length || 0);

    return Math.round((completedFields / totalFields) * 100);
  };

  const fetchAllResumes = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(API_PATHS.RESUME.GET_ALL);

      // Add completion percentage to each resume
      const resumesWithCompletion = response.data.map(resume => ({
        ...resume,
        completion: calculateCompletion(resume)
      }));

      setAllResumes(resumesWithCompletion);
    } catch (error) {
      console.error('Error fetching resumes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllResumes();
  }, []);

  const getCompletionColor = (completion) => {
    if (completion >= 90) return 'bg-green-500';
    if (completion >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getCompletionStatus = (completion) => {
    if (completion < 50) return "Getting Started";
    if (completion < 80) return "Almost There";
    return "Ready to Go!";
  };

  const handleDeleteResume = async () => {
    if (!resumeToDelete) return;

    try {
      await axiosInstance.delete(API_PATHS.RESUME.DELETE(resumeToDelete));
      toast.success('Resume deleted successfully');
      fetchAllResumes();
    } catch (error) {
      console.error('Error deleting resume:', error);
      toast.error('Failed to delete resume');
    } finally {
      setResumeToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteClick = (id) => {
    setResumeToDelete(id);
    setShowDeleteConfirm(true);
  };

  const handleATSCheck = (id) => {
    setSelectedResumeId(id);
    setShowATSModal(true);
    setAtsResult(null);
    setAtsForm({ jobTitle: '', jobDescription: '', keywords: '' });
  };

  const handleATSSubmit = async () => {
    if (!selectedResumeId) return;

    const keywordsArray = atsForm.keywords.split(',').map(k => k.trim()).filter(k => k);
    const hasInput = Boolean(
      atsForm.jobTitle.trim() || atsForm.jobDescription.trim() || keywordsArray.length
    );
    if (!hasInput) {
      toast.error('Add job title, description, or keywords before checking ATS.');
      return;
    }

    setLoadingATS(true);
    try {
      const response = await axiosInstance.post(API_PATHS.RESUME.ATS_SCORE(selectedResumeId), {
        jobTitle: atsForm.jobTitle.trim(),
        jobDescription: atsForm.jobDescription.trim(),
        keywords: keywordsArray,
      });
      const data = response.data || {};
      setAtsResult({
        score: typeof data.score === 'number' ? data.score : 0,
        feedback: data.feedback || 'ATS analysis completed.',
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
        usedHeuristic: data.usedHeuristic === true,
        source: data.source || (data.usedHeuristic === true ? 'heuristic' : 'unknown'),
        modelUsed: data.modelUsed || null,
        fallbackReason: data.fallbackReason || null,
      });
    } catch (error) {
      console.error('Error getting ATS score:', error);
      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Failed to get ATS score';
      toast.error(backendMessage);
    } finally {
      setLoadingATS(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Main Container */}
      <div className={styles.container}>
        {/* Dashboard Header */}
        <div className={styles.headerWrapper}>
          <div>
            <h1 className={styles.headerTitle}>My Resumes</h1>
            <p className={styles.headerSubtitle}>
              {allResumes.length > 0
                ? `You have ${allResumes.length} resume${allResumes.length !== 1 ? 's' : ''}`
                : 'Start building your professional resume'}
            </p>
          </div>

          <div className="flex gap-4">
            <button
              className={styles.createButton}
              onClick={() => setOpenCreateModal(true)}
            >
              <div className={styles.createButtonOverlay}></div>
              <span className={styles.createButtonContent}>
                Create New
                <LuFilePlus size={18} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className={styles.spinnerWrapper}>
            <div className={styles.spinner}></div>
          </div>
        )}

        {/* Empty State */}
        {!loading && allResumes.length === 0 && (
          <div className={styles.emptyStateWrapper}>
            <div className={styles.emptyIconWrapper}>
              <LuFilePlus size={32} className="text-violet-600" />
            </div>
            <h3 className={styles.emptyTitle}>No Resumes Yet</h3>
            <p className={styles.emptyText}>
              You haven't created any resumes yet. Start building your professional resume to land your dream job.
            </p>
            <button
              className={styles.createButton}
              onClick={() => setOpenCreateModal(true)}
            >
              <div className={styles.createButtonOverlay}></div>
              <span className={styles.createButtonContent}>
                Create Your First Resume
                <LuFilePlus size={20} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </div>
        )}

        {/* Grid View */}
        {!loading && allResumes.length > 0 && (
          <div className={styles.grid}>
            <div
              className={styles.newResumeCard}
              onClick={() => setOpenCreateModal(true)}
            >
              <div className={styles.newResumeIcon}>
                <LuCirclePlus size={32} className="text-white" />
              </div>
              <h3 className={styles.newResumeTitle}>Create New Resume</h3>
              <p className={styles.newResumeText}>Start building your career</p>
            </div>

            {allResumes.map((resume) => (
              <ResumeSummaryCard
                key={resume._id}
                imgUrl={resume.thumbnailLink}
                title={resume.title}
                createdAt={resume.createdAt}
                updatedAt={resume.updatedAt}
                onSelect={() => navigate(`/resume/${resume._id}`)}
                onDelete={() => handleDeleteClick(resume._id)}
                onATSCheck={() => handleATSCheck(resume._id)}
                completion={resume.completion || 0}
                isPremium={resume.isPremium}
                isNew={moment().diff(moment(resume.createdAt), 'days') < 7}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Resume Modal */}
      <Modal
        isOpen={openCreateModal}
        onClose={() => setOpenCreateModal(false)}
        hideHeader
        maxWidth="max-w-2xl"
      >
        <div className="p-6">
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>Create New Resume</h3>
            <button
              onClick={() => setOpenCreateModal(false)}
              className={styles.modalCloseButton}
            >
              ✕
            </button>
          </div>
          <CreateResumeForm onSuccess={() => {
            setOpenCreateModal(false);
            fetchAllResumes();
          }} />
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Confirm Deletion"
        showActionBtn
        actionBtnText="Delete"
        actionBtnClassName="bg-red-600 hover:bg-red-700"
        onActionClick={handleDeleteResume}
      >
        <div className="p-4">
          <div className="flex flex-col items-center text-center">
            <div className={styles.deleteIconWrapper}>
              <LuTrash2 size={24} className="text-orange-600" />
            </div>
            <h3 className={styles.deleteTitle}>Delete Resume?</h3>
            <p className={styles.deleteText}>
              Are you sure you want to delete this resume? This action cannot be undone.
            </p>
          </div>
        </div>
      </Modal>

      {/* ATS Score Modal */}
      <Modal
        isOpen={showATSModal}
        onClose={() => setShowATSModal(false)}
        title="Check ATS Score"
        showActionBtn
        actionBtnText={loadingATS ? "Checking..." : "Check Score"}
        actionBtnClassName="bg-blue-600 hover:bg-blue-700"
        onActionClick={handleATSSubmit}
        disabled={loadingATS}
      >
        <div className="p-4">
          {!atsResult ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title
                </label>
                <input
                  type="text"
                  value={atsForm.jobTitle}
                  onChange={(e) => setAtsForm({ ...atsForm, jobTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Software Engineer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Description
                </label>
                <textarea
                  value={atsForm.jobDescription}
                  onChange={(e) => setAtsForm({ ...atsForm, jobDescription: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="Paste the job description here..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={atsForm.keywords}
                  onChange={(e) => setAtsForm({ ...atsForm, keywords: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., JavaScript, React, Node.js"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600">{atsResult.score}/100</div>
                <p className="text-gray-600 mt-2">ATS Compatibility Score</p>
                {atsResult?.source && (
                  <p className="text-xs text-gray-500 mt-1">
                    Source: {atsResult.source === 'gemini' ? 'Gemini AI' : atsResult.source === 'heuristic' ? 'Heuristic Fallback' : 'Unknown (old backend response)'}
                    {atsResult?.modelUsed ? ` (${atsResult.modelUsed})` : ''}
                  </p>
                )}
                {atsResult.usedHeuristic && (
                  <div className="mt-3 inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
                    Heuristic fallback used for this score
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-medium text-gray-800">Feedback:</h4>
                <p className="text-gray-600 mt-1">{atsResult.feedback}</p>
              </div>
              <div>
                <h4 className="font-medium text-gray-800">Suggestions:</h4>
                <ul className="list-disc list-inside text-gray-600 mt-1">
                  {(atsResult.suggestions || []).map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default Dashboard;
