import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Star, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Destination, getAllDestinations } from '@/services/destinationService';
import { Loader2 } from 'lucide-react';
import { wishlistService } from '@/services/wishlistService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const Destinations: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getAllDestinations();
        // Filter to show only popular destinations
        const popularDestinations = data.filter(dest => dest.popular).slice(0, 4);
        setDestinations(popularDestinations);

        // Fetch user's wishlist if logged in
        if (user) {
          const wishlistData = await wishlistService.getWishlist(user._id);
          // wishlistData contains the full destination objects
          const wishlistIds = wishlistData.map(destination => destination._id.toString());
          setWishlist(wishlistIds);
        }
      } catch (error) {
        setError("Failed to load destinations. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleWishlistToggle = async (destinationId: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation when clicking the heart icon
    e.stopPropagation(); // Prevent event bubbling

    if (!user) {
      toast.error(t('loginToAddWishlist', 'Please login to add destinations to wishlist'));
      return;
    }

    try {
      const destinationIdStr = destinationId.toString();
      if (wishlist.includes(destinationIdStr)) {
        await wishlistService.removeFromWishlist(user._id, destinationIdStr);
        setWishlist(prev => prev.filter(id => id !== destinationIdStr));
        toast.success(t('removedFromWishlist', 'Removed from Wishlist'));
      } else {
        await wishlistService.addToWishlist(user._id, destinationIdStr);
        setWishlist(prev => [...prev, destinationIdStr]);
        toast.success(t('addedToWishlist', 'Added to Wishlist'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('failedToUpdateWishlist', 'Failed to update wishlist');
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <section className="py-20">
        <div className="container-custom">
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
            <p className="ml-2 text-gray-600">{t('loading', 'Loading...')}</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-20">
        <div className="container-custom">
          <div className="text-center text-red-600">
            <p>{error}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-20">
      <div className="container-custom">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="section-title">{String(t('popularDestinations'))}</h2>
            <p className="text-gray-600 max-w-2xl">
              {String(t('discoverMostSought'))}
            </p>
          </div>
          <Link to="/destinations" className="text-tourtastic-blue hover:text-tourtastic-dark-blue transition-colors hidden md:block">
            {t('viewAllDestinations')}
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {destinations.map((destination) => (
            <Link 
              key={destination._id} 
              to={`/destinations/${destination._id}`}
              className="cursor-pointer"
            >
              <Card className="h-full transition-all duration-300 hover:scale-105 hover:shadow-xl">
                <CardHeader className="p-0 relative group">
                  {/* CLS fix: explicit width/height for destination images */}
                  <img 
                    src={destination.image} 
                    alt={destination.name[i18n.language]} 
                    width="400"
                    height="192"
                    loading="lazy"
                    className="w-full h-48 object-cover rounded-t-md transition-transform duration-300 group-hover:scale-110" 
                  />
                  <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded-md text-sm flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" fill="currentColor" />
                    <span>{destination.rating.toFixed(1)}</span>
                  </div>
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-300 rounded-t-md"></div>
                </CardHeader>
                <CardContent className="p-4">
                  <h2 className="text-xl font-bold mb-2">{destination.name[i18n.language]}</h2>
                  <p className="text-gray-600 dark:text-gray-400">{destination.country[i18n.language]}</p>
                  <button
                    onClick={(e) => handleWishlistToggle(destination._id, e)}
                    className="mt-4 w-full bg-primary-50 hover:bg-primary-100 text-primary-600 py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Heart 
                      className={`w-5 h-5 ${wishlist.includes(destination._id.toString()) ? 'text-red-500 fill-current' : 'text-primary-600'}`} 
                    />
                    <span>{wishlist.includes(destination._id.toString()) ? t('removeFromWishlist', 'Remove from Wishlist') : t('addToWishlist', 'Add to Wishlist')}</span>
                  </button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        
        <div className="mt-8 text-center md:hidden">
          <Link to="/destinations" className="btn-primary">
            {t('viewAllDestinations')}
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Destinations;
