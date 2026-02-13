import httpStatus from 'http-status';
import catchAsync from '../utils/catchAsync.js';
import * as blogGeminiService from '../services/blogGemini.service.js';

const generate = catchAsync(async (req, res) => {
  const { mode, existingContent, title, keywords, wordCount, format } = req.body;
  const content = await blogGeminiService.generateBlog({
    mode,
    existingContent,
    title,
    keywords,
    wordCount,
    format,
  });
  res.status(httpStatus.OK).json({ content });
});

const generateFromTheme = catchAsync(async (req, res) => {
  const { theme, index, total, keywords, wordCount, format } = req.body;
  const result = await blogGeminiService.generateBlogFromTheme({
    theme,
    index,
    total,
    keywords,
    wordCount,
    format,
  });
  res.status(httpStatus.OK).json(result);
});

const getSuggestions = catchAsync(async (req, res) => {
  const { content, format } = req.body;
  const result = await blogGeminiService.getBlogSuggestions({ content, format });
  res.status(httpStatus.OK).json(result);
});

export { generate, generateFromTheme, getSuggestions };
