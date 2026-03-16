'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StepSidebar } from './StepSidebar';
import { MobileProgressBar } from './MobileProgressBar';
import { StepBasics } from './StepBasics';
import { StepDetails } from './StepDetails';
import { StepAmenities } from './StepAmenities';
import { StepPhotos } from './StepPhotos';
import { StepDescription } from './StepDescription';
import { StepReview } from './StepReview';
import { springConfig } from '@/lib/animations';

export type PropertyType = 'apartment' | 'house' | 'room';

export interface WizardFormData {
  // Basics
  address: string;
  monthlyRent: string;
  leaseStart: string;
  leaseEnd: string;
  propertyType: PropertyType;
  // Details
  bedrooms: number;
  bathrooms: number;
  sqft: string;
  floorLevel: string;
  furnished: boolean;
  parking: boolean;
  // Amenities
  amenities: readonly string[];
  // Photos
  photos: readonly File[];
  // Description
  description: string;
}

const INITIAL_FORM_DATA: WizardFormData = {
  address: '',
  monthlyRent: '',
  leaseStart: '',
  leaseEnd: '',
  propertyType: 'apartment',
  bedrooms: 1,
  bathrooms: 1,
  sqft: '',
  floorLevel: '',
  furnished: false,
  parking: false,
  amenities: [],
  photos: [],
  description: '',
};

export const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'details', label: 'Details' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'photos', label: 'Photos' },
  { id: 'description', label: 'Description' },
  { id: 'review', label: 'Review' },
] as const;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: springConfig.gentle,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  }),
};

interface PostWizardProps {
  readonly userEmail?: string;
}

export function PostWizard({ userEmail }: PostWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<WizardFormData>(INITIAL_FORM_DATA);
  const [completedSteps, setCompletedSteps] = useState<ReadonlyArray<number>>([]);
  const [direction, setDirection] = useState(0);

  const updateFormData = useCallback(
    (updates: Partial<WizardFormData>) => {
      setFormData((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const goToStep = useCallback(
    (step: number) => {
      setDirection(step > currentStep ? 1 : -1);
      setCurrentStep(step);
    },
    [currentStep]
  );

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCompletedSteps((prev) =>
        prev.includes(currentStep) ? prev : [...prev, currentStep]
      );
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const renderStep = () => {
    const stepProps = { formData, updateFormData };
    switch (currentStep) {
      case 0:
        return <StepBasics key="basics" {...stepProps} />;
      case 1:
        return <StepDetails key="details" {...stepProps} />;
      case 2:
        return <StepAmenities key="amenities" {...stepProps} />;
      case 3:
        return <StepPhotos key="photos" {...stepProps} />;
      case 4:
        return <StepDescription key="description" {...stepProps} />;
      case 5:
        return <StepReview key="review" formData={formData} userEmail={userEmail} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <StepSidebar
          steps={STEPS}
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={goToStep}
        />
      </div>

      {/* Mobile progress bar */}
      <div className="lg:hidden">
        <MobileProgressBar
          currentStep={currentStep}
          totalSteps={STEPS.length}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 px-4 py-6 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
              <Button
                variant="outline"
                size="lg"
                onClick={handleBack}
                disabled={currentStep === 0}
                className="gap-2 rounded-xl"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>

              {currentStep < STEPS.length - 1 ? (
                <Button
                  size="lg"
                  onClick={handleNext}
                  className="gap-2 rounded-xl bg-teal-800 py-4 font-bold shadow-lg hover:bg-teal-900"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
