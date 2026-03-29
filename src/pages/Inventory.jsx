import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { Plus, Package, AlertTriangle, X } from 'lucide-react';
import { format } from 'date-fns';

export default function Inventory() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: async () => {
      return await api.entities.Product.list('-created_at');
    },
  });

  const categories = ['all', 'fillers', 'toxins', 'skincare', 'equipment', 'consumables', 'other'];

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const lowStockProducts = products.filter(p => p.current_stock <= p.minimum_stock);
  const expiringProducts = products.filter(p => {
    if (!p.expiry_date) return false;
    const daysUntilExpiry = Math.floor((new Date(p.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  });

  const totalInventoryValue = products.reduce((sum, p) => sum + (p.current_stock * p.cost_per_unit), 0);

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 50%, #0f1419 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#d6b164]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#4d647f]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-light text-white/90 mb-3 tracking-tight">Inventory</h1>
          <p className="text-white/40 text-lg font-light">Stock levels, expiry monitoring, and product management</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#d6b164]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs tracking-[0.2em] uppercase">Products</span>
                <Package className="w-5 h-5 text-[#d6b164]/60" />
              </div>
              <p className="text-4xl font-light text-white/90">{products.length}</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs tracking-[0.2em] uppercase">Value</span>
                <div className="w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>
              <p className="text-4xl font-light text-white/90">£{(totalInventoryValue / 1000).toFixed(1)}k</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-red-400/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-red-400/20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs tracking-[0.2em] uppercase">Low Stock</span>
                <AlertTriangle className="w-5 h-5 text-red-400/60" />
              </div>
              <p className="text-4xl font-light text-red-400">{lowStockProducts.length}</p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-amber-400/20">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs tracking-[0.2em] uppercase">Expiring</span>
                <AlertTriangle className="w-5 h-5 text-amber-400/60" />
              </div>
              <p className="text-4xl font-light text-amber-400">{expiringProducts.length}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          {/* Search */}
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
          />

          {/* Category Pills */}
          <div className="flex gap-2 flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-5 py-2 rounded-full text-sm font-light tracking-wider transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#d6b164]/20 text-[#d6b164] border border-[#d6b164]/30'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
                }`}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddProduct(true)}
            className="px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full hover:bg-[#d6b164]/30 transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5 text-[#d6b164]" />
            <span className="text-[#d6b164] text-sm tracking-wider">ADD</span>
          </button>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#d6b164]/30 border-t-[#d6b164] rounded-full animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-lg">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredProducts.map((product) => {
              const isLowStock = product.current_stock <= product.minimum_stock;
              const daysUntilExpiry = product.expiry_date
                ? Math.floor((new Date(product.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
                : null;
              const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry >= 0;

              return (
                <div key={product.id} className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#d6b164]/0 via-[#d6b164]/5 to-[#d6b164]/0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 group-hover:border-[#d6b164]/30 transition-all">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-6 items-center">
                      {/* Product Name */}
                      <div className="md:col-span-2">
                        <h3 className="text-white/90 text-lg font-light mb-1">{product.name}</h3>
                        {product.brand && <p className="text-white/30 text-sm">{product.brand}</p>}
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4d647f]/20 border border-[#4d647f]/30">
                          <span className="text-[#4d647f] text-xs tracking-wider">{product.category.toUpperCase()}</span>
                        </div>
                      </div>

                      {/* Stock */}
                      <div>
                        <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Stock</span>
                        <p className={`text-2xl font-light ${isLowStock ? 'text-red-400' : 'text-white/90'}`}>
                          {product.current_stock} {product.unit}
                        </p>
                        <p className="text-white/20 text-xs">Min: {product.minimum_stock}</p>
                      </div>

                      {/* Cost */}
                      <div>
                        <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Cost</span>
                        <p className="text-white/90 text-xl font-light">£{product.cost_per_unit.toFixed(2)}</p>
                      </div>

                      {/* Value */}
                      <div>
                        <span className="text-white/30 text-xs tracking-wider uppercase block mb-1">Value</span>
                        <p className="text-[#d6b164] text-xl font-light">
                          £{(product.current_stock * product.cost_per_unit).toFixed(0)}
                        </p>
                      </div>

                      {/* Status */}
                      <div className="flex flex-col gap-2">
                        {isLowStock && (
                          <div className="px-3 py-1 rounded-full bg-red-400/10 border border-red-400/30 text-center">
                            <span className="text-red-400 text-xs tracking-wider">LOW STOCK</span>
                          </div>
                        )}
                        {isExpiringSoon && (
                          <div className="px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-center">
                            <span className="text-amber-400 text-xs tracking-wider">{daysUntilExpiry}D LEFT</span>
                          </div>
                        )}
                        {!isLowStock && !isExpiringSoon && (
                          <div className="px-3 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-center">
                            <span className="text-emerald-400 text-xs tracking-wider">GOOD</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Product Modal */}
        {showAddProduct && (
          <AddProductModal
            onClose={() => setShowAddProduct(false)}
            onSuccess={() => {
              queryClient.invalidateQueries(['inventory-products']);
              setShowAddProduct(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function AddProductModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    sku: '',
    category: 'fillers',
    current_stock: 0,
    minimum_stock: 0,
    cost_per_unit: 0,
    unit: 'units',
    expiry_date: '',
    supplier: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.entities.Product.create({
        ...formData,
        created_at: new Date().toISOString(),
      });
      onSuccess();
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Failed to create product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0a0e1a] rounded-3xl border border-white/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-light text-white/90 tracking-tight">Add Product</h2>
            <p className="text-white/40 text-sm mt-1">Add new product to inventory</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Product Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              >
                <option value="fillers">Fillers</option>
                <option value="toxins">Toxins</option>
                <option value="skincare">Skincare</option>
                <option value="equipment">Equipment</option>
                <option value="consumables">Consumables</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Unit *</label>
              <select
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              >
                <option value="units">Units</option>
                <option value="ml">ml</option>
                <option value="mg">mg</option>
                <option value="vials">Vials</option>
                <option value="bottles">Bottles</option>
                <option value="boxes">Boxes</option>
              </select>
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Current Stock *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Minimum Stock *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.minimum_stock}
                onChange={(e) => setFormData({ ...formData, minimum_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Cost per Unit (£) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 placeholder:text-white/30 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-white/40 text-xs tracking-wider uppercase mb-2">Expiry Date</label>
              <input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/90 focus:outline-none focus:border-[#d6b164]/50 transition-all"
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full text-white/60 hover:text-white/90 hover:border-white/20 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-[#d6b164]/20 backdrop-blur-xl border border-[#d6b164]/30 rounded-full text-[#d6b164] hover:bg-[#d6b164]/30 transition-all disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
