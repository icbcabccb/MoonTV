// lib/tmdb.ts

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500'; // 图片使用 w500 大小

// 1. 定义豆瓣格式的接口 (为了骗过你的前端)
export interface DoubanSubject {
  id: string;
  title: string;
  original_title: string;
  year: string;
  images: {
    large: string;
    medium?: string;
    small?: string;
  };
  rating: {
    average: number;
  };
  genres: string[];
  casts: { name: string; id?: string }[];
  directors: { name: string; id?: string }[];
  summary: string;
}

// 2. TMDB 数据转豆瓣格式 (核心适配器)
function normalizeToDouban(item: any): DoubanSubject {
  const isTv = !!item.first_air_date; // 判断是否为剧集
  const title = item.title || item.name || '';
  const original_title = item.original_title || item.original_name || '';
  const date = item.release_date || item.first_air_date || '';
  const year = date ? date.split('-')[0] : '';
  
  // 处理图片：如果没有图，给一个灰色占位图
  const poster = item.poster_path 
    ? `${IMAGE_BASE_URL}${item.poster_path}` 
    : 'https://via.placeholder.com/400x600?text=No+Cover';

  return {
    id: item.id.toString(),
    title: title,
    original_title: original_title,
    year: year,
    images: {
      large: poster,
      medium: poster, // 为了兼容性，三个尺寸都填一样的
      small: poster,
    },
    rating: {
      average: item.vote_average || 0, // TMDB 也是 10 分制，直接用
    },
    genres: [], // 列表页通常拿不到详细分类名，先留空，避免报错
    casts: [],  // 列表页拿不到演员，留空
    directors: [],
    summary: item.overview || '',
  };
}

// 3. 通用请求函数
async function fetchTMDB(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.append('api_key', TMDB_API_KEY || '');
  url.searchParams.append('language', 'zh-CN'); // 强制中文
  
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
        console.error(`TMDB Error ${res.status}:`, await res.text());
        return null;
    }
    return await res.json();
  } catch (error) {
    console.error('TMDB Network Error:', error);
    return null;
  }
}

// 4. 对外暴露的方法 (替换原豆瓣接口)
export async function getMovieList(type: string, tag: string = 'hot', page: number = 1, limit: number = 20): Promise<DoubanSubject[]> {
  // 映射逻辑：将豆瓣的 "tag" 映射到 TMDB 的接口
  let endpoint = '/movie/popular'; // 默认
  let mediaType = 'movie';

  // 简单判断是电影还是电视剧
  if (type === 'tv') mediaType = 'tv';
  
  // 映射分类
  if (tag === 'hot' || tag === '热门') {
    endpoint = `/${mediaType}/popular`;
  } else if (tag === 'latest' || tag === '最新') {
    endpoint = `/${mediaType}/now_playing`; // TV用 on_the_air
    if (mediaType === 'tv') endpoint = '/tv/on_the_air';
  } else if (tag === 'top250' || tag === 'high_score') {
    endpoint = `/${mediaType}/top_rated`;
  } else {
    // 如果是其他特定分类（如“动作片”），TMDB需要用 discover 接口，这里暂时回落到 popular
    endpoint = `/${mediaType}/popular`; 
  }

  const data = await fetchTMDB(endpoint, { page: page.toString() });
  
  if (!data || !data.results) return [];

  // 转换数据
  return data.results.map(normalizeToDouban);
}

// 搜索功能
export async function searchMovies(query: string, page: number = 1): Promise<DoubanSubject[]> {
  const data = await fetchTMDB('/search/multi', { query, page: page.toString() });
  if (!data || !data.results) return [];
  // 过滤掉 'person' 类型的结果，只保留 movie 和 tv
  const filtered = data.results.filter((i: any) => i.media_type === 'movie' || i.media_type === 'tv');
  return filtered.map(normalizeToDouban);
}
