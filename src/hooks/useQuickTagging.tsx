import { useState, useEffect, useCallback } from 'react';
import { getTags, getDefaultTags, updateTransaction, auth } from '../firebase/config';
import { onAuthStateChanged, type User } from 'firebase/auth';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface Transaction {
  id: string;
  description: string;
  tagIds?: string[];
}

interface UseQuickTaggingProps {
  transaction: Transaction;
  onTagsUpdate: (transactionId: string, newTagIds: string[]) => void;
}

export const useQuickTagging = ({ transaction, onTagsUpdate }: UseQuickTaggingProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Set up auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  // Load all available tags
  useEffect(() => {
    const loadTags = async () => {
      if (!user) {
        console.log('🏷️ No user found, skipping tag loading');
        return;
      }
      
      try {
        console.log('🏷️ Loading tags for user:', user.uid);
        setIsLoading(true);
        const [userTags, defaultTags] = await Promise.all([
          getTags(user.uid),
          Promise.resolve(getDefaultTags())
        ]);
        
        console.log('🏷️ Loaded tags:', { userTags: userTags.length, defaultTags: defaultTags.length });
        
        // Combine and deduplicate tags
        const tagMap = new Map();
        defaultTags.forEach(tag => tagMap.set(tag.id, tag));
        userTags.forEach(tag => tagMap.set(tag.id, tag));
        
        const allTagsArray = Array.from(tagMap.values());
        console.log('🏷️ Total combined tags:', allTagsArray.length);
        setAllTags(allTagsArray);
      } catch (error) {
        console.error('❌ Error loading tags:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTags();
  }, [user]);

  // Get current transaction tags
  const currentTags = allTags.filter(tag => 
    transaction.tagIds?.includes(tag.id)
  );

  // Get available tags (not currently applied)
  const availableTags = allTags.filter(tag => 
    !transaction.tagIds?.includes(tag.id)
  );

  // Filter tags based on search query
  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Smart tag suggestions based on transaction description
  const suggestedTags = useCallback(() => {
    if (!transaction.description) return [];
    
    const description = transaction.description.toLowerCase();
    const suggestions: Tag[] = [];
    
    // Common patterns for tag suggestions
    const patterns = [
      { keywords: ['grocery', 'supermarket', 'food', 'restaurant'], tag: 'Food & Dining' },
      { keywords: ['gas', 'fuel', 'shell', 'exxon', 'bp'], tag: 'Transportation' },
      { keywords: ['amazon', 'shopping', 'store', 'mall'], tag: 'Shopping' },
      { keywords: ['netflix', 'spotify', 'subscription'], tag: 'Subscriptions' },
      { keywords: ['rent', 'mortgage', 'utilities'], tag: 'Housing' },
      { keywords: ['medical', 'doctor', 'pharmacy', 'health'], tag: 'Healthcare' },
      { keywords: ['salary', 'payroll', 'income'], tag: 'Income' },
      { keywords: ['transfer', 'payment', 'deposit'], tag: 'Transfer' },
    ];

    patterns.forEach(pattern => {
      if (pattern.keywords.some(keyword => description.includes(keyword))) {
        const matchingTag = availableTags.find(tag => 
          tag.name.toLowerCase().includes(pattern.tag.toLowerCase())
        );
        if (matchingTag && !suggestions.find(s => s.id === matchingTag.id)) {
          suggestions.push(matchingTag);
        }
      }
    });

    return suggestions.slice(0, 3); // Limit to top 3 suggestions
  }, [transaction.description, availableTags]);

  // Get popular tags (frequently used)
  const popularTags = availableTags
    .filter(tag => !suggestedTags().find(s => s.id === tag.id))
    .slice(0, 5); // Show top 5 popular tags

  // Combined and sorted tags for display
  const displayTags = [
    ...suggestedTags(),
    ...popularTags,
    ...filteredTags.filter(tag => 
      !suggestedTags().find(s => s.id === tag.id) && 
      !popularTags.find(p => p.id === tag.id)
    )
  ].slice(0, 8); // Limit total displayed tags

  // Add tag to transaction
  const addTag = async (tagId: string) => {
    if (!user || isUpdating) {
      console.log('🏷️ Cannot add tag:', { user: !!user, isUpdating });
      return;
    }
    
    try {
      console.log('🏷️ Adding tag:', tagId, 'to transaction:', transaction.id);
      setIsUpdating(true);
      const newTagIds = [...(transaction.tagIds || []), tagId];
      await updateTransaction(transaction.id, { tagIds: newTagIds }, user.uid);
      
      console.log('🏷️ Tag added successfully, updating UI');
      onTagsUpdate(transaction.id, newTagIds);
    } catch (error) {
      console.error('❌ Error adding tag:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Remove tag from transaction
  const removeTag = async (tagId: string) => {
    if (!user || isUpdating) return;
    
    try {
      setIsUpdating(true);
      const newTagIds = (transaction.tagIds || []).filter(id => id !== tagId);
      await updateTransaction(transaction.id, { tagIds: newTagIds }, user.uid);
      
      onTagsUpdate(transaction.id, newTagIds);
    } catch (error) {
      console.error('Error removing tag:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Toggle tag (add if not present, remove if present)
  const toggleTag = async (tagId: string) => {
    const isCurrentlyApplied = transaction.tagIds?.includes(tagId);
    
    if (isCurrentlyApplied) {
      await removeTag(tagId);
    } else {
      await addTag(tagId);
    }
  };

  return {
    currentTags,
    displayTags,
    suggestedTags: suggestedTags(),
    searchQuery,
    setSearchQuery,
    isLoading,
    isUpdating,
    addTag,
    removeTag,
    toggleTag,
  };
};

export default useQuickTagging;
