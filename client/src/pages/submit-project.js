// pages/submit-project.js
import React, { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '../components/layout/Header';
import ProjectForm from '../components/forms/ProjectForm';
import { useAuth } from '../context/AuthContext';

export default function SubmitProject() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    // Rediriger si non authentifié
    if (!loading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);
  
  if (loading) {
    return <div className="text-center py-10">Chargement...</div>;
  }
  
  if (!isAuthenticated) {
    return null;
  }
  
  return (
    <div>
      <Head>
        <title>Hub Projets - Soumettre un projet</title>
      </Head>
      
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Soumettre un nouveau projet</h1>
        
        <div className="max-w-3xl mx-auto">
          <ProjectForm />
        </div>
      </main>
    </div>
  );
}
