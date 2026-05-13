'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/store';

interface MarketInfo {
  name: string;
  projectCount: number;
}

export default function RegionsPage() {
  const { locale } = useTranslation();
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMarket, setNewMarket] = useState('');

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMarket, setEditingMarket] = useState('');
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchMarkets();
  }, []);

  const fetchMarkets = () => {
    fetch('/api/markets')
      .then((res) => res.json())
      .then((data) => {
        setMarkets(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleAddMarket = () => {
    if (!newMarket.trim()) return;
    window.location.href = `/regions/${encodeURIComponent(newMarket.trim())}`;
  };

  const handleEditMarket = async () => {
    if (!editName.trim() || editName.trim() === editingMarket) {
      setEditDialogOpen(false);
      return;
    }
    try {
      await fetch('/api/markets/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingMarket, newName: editName.trim() }),
      });
      fetchMarkets();
      setEditDialogOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMarket = async (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(locale === 'zh'
      ? `确定删除"${name}"及其所有项目？此操作不可撤销。`
      : `Delete "${name}" and all its projects? This cannot be undone.`
    )) return;

    try {
      await fetch('/api/markets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setMarkets((prev) => prev.filter((m) => m.name !== name));
    } catch (err) {
      console.error(err);
    }
  };

  const openEditDialog = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingMarket(name);
    setEditName(name);
    setEditDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-slate-400">
        {locale === 'zh' ? '加载中...' : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        {locale === 'zh' ? '所属战区' : 'Regions'}
      </h1>

      {/* Market cards + Add button */}
      <div className="flex flex-col items-center justify-center py-8 space-y-6">
        {/* Existing markets */}
        {markets.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 w-full">
            {markets.map((market) => (
              <Link key={market.name} href={`/regions/${encodeURIComponent(market.name)}`}>
                <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-slate-300 bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-slate-700" />
                        {market.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => openEditDialog(e, market.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-700 transition-all p-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteMarket(e, market.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-700 transition-colors" />
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-xs text-slate-400">
                      {market.projectCount} {locale === 'zh' ? '个项目' : market.projectCount === 1 ? 'project' : 'projects'}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Add country button */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            className="flex items-center justify-center gap-3 rounded-2xl bg-slate-800 px-20 py-12 text-base font-medium text-white hover:bg-slate-700 shadow-lg transition-all"
          >
            <Plus className="h-5 w-5" />
            {locale === 'zh' ? '添加国家' : 'Add Country'}
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{locale === 'zh' ? '添加国家/地区' : 'Add Country/Region'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <Input
                value={newMarket}
                onChange={(e) => setNewMarket(e.target.value)}
                placeholder={locale === 'zh' ? '输入国家或地区名称' : 'Enter country or region name'}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMarket()}
                autoFocus
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleAddMarket}
                  disabled={!newMarket.trim()}
                  className="bg-slate-800 hover:bg-slate-900"
                >
                  {locale === 'zh' ? '确认' : 'Confirm'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit market dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{locale === 'zh' ? '编辑国家/地区' : 'Edit Country/Region'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEditMarket()}
              autoFocus
            />
            <div className="flex justify-end">
              <Button
                onClick={handleEditMarket}
                disabled={!editName.trim()}
                className="bg-slate-800 hover:bg-slate-900"
              >
                {locale === 'zh' ? '保存' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
