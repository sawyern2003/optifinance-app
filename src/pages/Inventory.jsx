import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';
import { Plus, Package, AlertTriangle, TrendingDown, Search, Filter } from 'lucide-react';
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #fafbfc 0%, #f5f6f8 100%)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1a2845] mb-2">Inventory Management</h1>
          <p className="text-gray-600">Track stock levels, manage products, and monitor expiry dates</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Total Products</span>
              <Package className="w-5 h-5 text-[#1a2845]" />
            </div>
            <p className="text-2xl font-bold text-[#1a2845]">{products.length}</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Inventory Value</span>
              <TrendingDown className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-[#1a2845]">£{totalInventoryValue.toFixed(2)}</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-red-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Low Stock</span>
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-600">{lowStockProducts.length}</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-orange-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Expiring Soon</span>
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-orange-600">{expiringProducts.length}</p>
          </div>
        </div>

        {/* Alerts */}
        {(lowStockProducts.length > 0 || expiringProducts.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
            <h3 className="text-sm font-semibold text-amber-900 mb-2">Attention Required</h3>
            {lowStockProducts.length > 0 && (
              <p className="text-sm text-amber-800 mb-1">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                {lowStockProducts.length} product{lowStockProducts.length > 1 ? 's' : ''} running low on stock
              </p>
            )}
            {expiringProducts.length > 0 && (
              <p className="text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                {expiringProducts.length} product{expiringProducts.length > 1 ? 's' : ''} expiring within 30 days
              </p>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedCategory === cat
                      ? 'bg-[#1a2845] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Add Product Button */}
            <button
              onClick={() => setShowAddProduct(true)}
              className="flex items-center gap-2 px-6 py-2 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] transition-all"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-[#1a2845] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading inventory...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No products found</p>
              <button
                onClick={() => setShowAddProduct(true)}
                className="mt-4 text-[#1a2845] hover:underline"
              >
                Add your first product
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost/Unit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredProducts.map((product) => {
                    const isLowStock = product.current_stock <= product.minimum_stock;
                    const daysUntilExpiry = product.expiry_date
                      ? Math.floor((new Date(product.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
                      : null;
                    const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry >= 0;

                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          {product.brand && <div className="text-sm text-gray-500">{product.brand}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{product.sku || '-'}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {product.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`font-medium ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                            {product.current_stock} {product.unit}
                          </div>
                          <div className="text-xs text-gray-500">Min: {product.minimum_stock}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">£{product.cost_per_unit.toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          £{(product.current_stock * product.cost_per_unit).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {product.expiry_date ? (
                            <div className={isExpiringSoon ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                              {format(new Date(product.expiry_date), 'dd/MM/yyyy')}
                              {isExpiringSoon && <div className="text-xs">({daysUntilExpiry} days)</div>}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {isLowStock && (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                Low Stock
                              </span>
                            )}
                            {isExpiringSoon && (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                                Expiring
                              </span>
                            )}
                            {!isLowStock && !isExpiringSoon && (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Good
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-[#1a2845]">Add New Product</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Stock *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.minimum_stock}
                onChange={(e) => setFormData({ ...formData, minimum_stock: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit (£) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.cost_per_unit}
                onChange={(e) => setFormData({ ...formData, cost_per_unit: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select
                required
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={formData.expiry_date}
                onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1a2845] focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-[#1a2845] text-white rounded-lg hover:bg-[#2a3855] disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
