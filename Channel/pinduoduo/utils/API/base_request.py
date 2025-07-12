import requests
import json
import time
import random
from typing import Dict, Any, Optional, Union, Callable
from utils.logger import get_logger
from database import db_manager

# 延迟导入，避免循环导入
import importlib


class BaseRequest:
    """
    API请求基类，统一管理requests请求
    
    功能特性：
    - 统一的请求重试机制（指数退避+随机抖动）
    - 自动会话过期检测和重新登录
    - 统一的错误处理和日志记录
    - 灵活的请求头和cookies管理
    
    自动重新登录说明：
    当API响应包含 error_code=43001 且 error_msg 包含"会话已过期"时，
    会自动调用 pdd_login.py 重新登录并更新cookies，然后重试原请求。
    """
    
    def __init__(self, shop_id: str = None, user_id: str = None, channel_name: str = "pinduoduo",
                 max_retries: int = 3, retry_delay: float = 1.0, retry_backoff: float = 2.0):
        """
        初始化基类
        
        Args:
            shop_id: 店铺ID
            user_id: 用户ID  
            channel_name: 渠道名称
            max_retries: 最大重试次数
            retry_delay: 初始重试延迟时间（秒）
            retry_backoff: 重试退避倍数
        """
        self.logger = get_logger(self.__class__.__name__)
        self.shop_id = shop_id
        self.user_id = user_id
        self.channel_name = channel_name
        
        # 重试配置
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.retry_backoff = retry_backoff
        
        # 默认请求头
        self.default_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'priority': 'u=1, i'
        }
        
        # 初始化账户信息和cookies
        self.cookies = {}
        self.account_name = "未知账号"
        
        if shop_id and user_id:
            self._init_account_info()
    
    def _init_account_info(self):
        """初始化账户信息"""
        try:
            account_info = db_manager.get_account(self.channel_name, self.shop_id, self.user_id)
            if account_info:
                self.account_name = account_info.get('username', '未知账号')
                cookies_data = account_info.get('cookies')
                
                # 处理cookies格式
                if isinstance(cookies_data, str):
                    try:
                        self.cookies = json.loads(cookies_data)
                    except json.JSONDecodeError:
                        self.logger.error(f"解析账号 {self.account_name} 的cookies失败")
                        self.cookies = {}
                elif isinstance(cookies_data, dict):
                    self.cookies = cookies_data
                else:
                    self.logger.warning(f"账号 {self.account_name} 的cookies为空")
                    self.cookies = {}
            else:
                self.logger.error(f"无法在数据库中找到账户: shop_id={self.shop_id}, user_id={self.user_id}")
        except Exception as e:
            self.logger.error(f"初始化账户信息失败: {str(e)}")
    
    def _is_session_expired(self, response_data: Dict[str, Any]) -> bool:
        """
        检测会话是否过期
        
        Args:
            response_data: 响应数据
            
        Returns:
            是否会话过期
        """
        if not response_data:
            return False
            
        # 检测拼多多会话过期的特征
        if (response_data.get('error_code') == 43001 and 
            '会话已过期' in str(response_data.get('error_msg', ''))):
            self.logger.warning(f"检测到账号 {self.account_name} 会话过期")
            return True
            
        return False
    
    def _relogin_and_update_cookies(self) -> bool:
        """
        重新获取cookies并更新
        优先使用refresh_cookies（无需重新输入密码），失败时回退到完整重新登录
        
        Returns:
            是否重新获取cookies成功
        """
        try:
            # 获取账号信息
            account_info = db_manager.get_account(self.channel_name, self.shop_id, self.user_id)
            if not account_info:
                self.logger.error(f"无法获取账号信息进行重新登录: shop_id={self.shop_id}, user_id={self.user_id}")
                return False
                
            username = account_info.get('username')
            password = account_info.get('password')
            
            if not username:
                self.logger.error(f"账号 {self.account_name} 缺少用户名，无法重新登录")
                return False
            
            # 动态导入登录模块，避免循环导入
            pdd_login_module = importlib.import_module('Channel.pinduoduo.pdd_login')
            
            # 处理异步执行 - 检测当前是否在事件循环中
            import asyncio
            import concurrent.futures
            
            def run_async_function(func, *args):
                """在新线程中运行异步函数"""
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(func(*args))
                finally:
                    new_loop.close()
            
            def execute_async_safely(func, *args):
                """安全执行异步函数"""
                try:
                    # 检测是否在事件循环中
                    current_loop = asyncio.get_running_loop()
                    if current_loop:
                        # 在事件循环中，使用线程执行
                        self.logger.debug("检测到当前在事件循环中，使用线程执行异步操作")
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            future = executor.submit(run_async_function, func, *args)
                            return future.result(timeout=60)  # 60秒超时
                    else:
                        # 不在事件循环中，直接执行
                        return run_async_function(func, *args)
                except RuntimeError:
                    # 没有运行中的事件循环，直接执行
                    self.logger.debug("没有检测到运行中的事件循环，直接执行异步操作")
                    return run_async_function(func, *args)
            
            # 第一步：尝试使用refresh_cookies刷新（推荐方式）
            self.logger.info(f"尝试为账号 {self.account_name} 刷新cookies（无需重新登录）...")
            
            try:
                refresh_pdd_cookies = pdd_login_module.refresh_pdd_cookies
                refresh_result = execute_async_safely(refresh_pdd_cookies, username, password)
                
                if refresh_result and isinstance(refresh_result, dict):
                    new_cookies = refresh_result.get('cookies')
                    if new_cookies:
                        self.update_cookies(new_cookies)
                        
                        # 更新数据库中的cookies
                        db_manager.update_account_cookies(
                            self.channel_name, 
                            self.shop_id, 
                            self.user_id, 
                            new_cookies
                        )
                        
                        self.logger.info(f"账号 {self.account_name} cookies刷新成功")
                        return True
                    else:
                        self.logger.warning(f"账号 {self.account_name} cookies刷新返回无效数据")
                else:
                    self.logger.warning(f"账号 {self.account_name} cookies刷新失败，可能登录状态已失效")
                    
            except Exception as refresh_error:
                self.logger.warning(f"账号 {self.account_name} cookies刷新异常: {str(refresh_error)}")
            
            # 第二步：如果刷新失败，回退到完整重新登录
            if not password:
                self.logger.error(f"账号 {self.account_name} 缺少密码，无法进行完整重新登录")
                return False
                
            self.logger.info(f"回退到完整重新登录模式（账号 {self.account_name}）...")
            
            try:
                login_pdd = pdd_login_module.login_pdd
                login_result = execute_async_safely(login_pdd, username, password)
                
                if login_result and isinstance(login_result, dict):
                    new_cookies = login_result.get('cookies')
                    if new_cookies:
                        self.update_cookies(new_cookies)
                        
                        # 更新数据库中的cookies
                        db_manager.update_account_cookies(
                            self.channel_name, 
                            self.shop_id, 
                            self.user_id, 
                            new_cookies
                        )
                        
                        self.logger.info(f"账号 {self.account_name} 完整重新登录成功，cookies已更新")
                        return True
                    else:
                        self.logger.error(f"账号 {self.account_name} 完整重新登录失败：未获取到有效cookies")
                        return False
                else:
                    self.logger.error(f"账号 {self.account_name} 完整重新登录失败")
                    return False
                    
            except Exception as login_error:
                self.logger.error(f"账号 {self.account_name} 完整重新登录异常: {str(login_error)}")
                return False
                
        except Exception as e:
            self.logger.error(f"账号 {self.account_name} 重新获取cookies过程中发生错误: {str(e)}")
            return False
    
    def _should_retry(self, response: requests.Response = None, exception: Exception = None) -> bool:
        """
        判断是否应该重试
        
        Args:
            response: HTTP响应对象
            exception: 异常对象
            
        Returns:
            是否应该重试
        """
        if exception:
            # 网络相关异常应该重试
            if isinstance(exception, (requests.ConnectionError, requests.Timeout, 
                                    requests.HTTPError, requests.TooManyRedirects)):
                return True
        
        if response:
            # 服务器错误状态码应该重试
            if response.status_code >= 500:
                return True
            # 特定的客户端错误也可以重试
            if response.status_code in [429, 408, 502, 503, 504]:
                return True
        
        return False
    
    def _calculate_retry_delay(self, attempt: int) -> float:
        """
        计算重试延迟时间（指数退避+随机抖动）
        
        Args:
            attempt: 当前重试次数
            
        Returns:
            延迟时间（秒）
        """
        # 指数退避：base_delay * (backoff ^ attempt)
        delay = self.retry_delay * (self.retry_backoff ** attempt)
        
        # 添加随机抖动，避免雷鸣群体效应
        jitter = random.uniform(0.1, 0.3) * delay
        
        return delay + jitter
    
    def _execute_with_retry(self, request_func: Callable, expect_json: bool = True) -> Optional[Dict[str, Any]]:
        """
        带重试机制执行请求
        
        Args:
            request_func: 请求函数
            expect_json: 是否期望JSON响应
            
        Returns:
            响应数据
        """
        last_exception = None
        last_response = None
        relogin_attempted = False  # 标记是否已尝试重新登录
        
        for attempt in range(self.max_retries + 1):
            try:
                response = request_func()
                
                # 检查响应是否成功
                if response and response.status_code == 200:
                    response_data = self._handle_response(response, expect_json)
                    
                    # 检测会话是否过期
                    if (response_data and self._is_session_expired(response_data) 
                        and not relogin_attempted and self.shop_id and self.user_id):
                        
                        self.logger.info(f"检测到会话过期，尝试重新登录...")
                        relogin_attempted = True
                        
                        if self._relogin_and_update_cookies():
                            self.logger.info(f"重新登录成功，重试请求...")
                            # 重新登录成功，继续下一次循环重试请求
                            continue
                        else:
                            self.logger.error(f"重新登录失败，请求终止")
                            return response_data
                    
                    return response_data
                
                last_response = response
                
                # 判断是否应该重试
                if attempt < self.max_retries and self._should_retry(response=response):
                    delay = self._calculate_retry_delay(attempt)
                    self.logger.warning(f"请求失败，状态码: {response.status_code}，"
                                      f"第 {attempt + 1} 次重试，延迟 {delay:.2f} 秒")
                    time.sleep(delay)
                    continue
                else:
                    # 不需要重试或已达最大重试次数
                    return self._handle_response(response, expect_json)
                    
            except Exception as e:
                last_exception = e
                
                # 判断是否应该重试
                if attempt < self.max_retries and self._should_retry(exception=e):
                    delay = self._calculate_retry_delay(attempt)
                    self.logger.warning(f"请求异常: {str(e)}，"
                                      f"第 {attempt + 1} 次重试，延迟 {delay:.2f} 秒")
                    time.sleep(delay)
                    continue
                else:
                    # 不需要重试或已达最大重试次数
                    self.logger.error(f"请求最终失败: {str(e)}")
                    return None
        
        # 如果所有重试都失败了
        if last_exception:
            self.logger.error(f"重试 {self.max_retries} 次后仍然失败，最后异常: {str(last_exception)}")
        elif last_response:
            self.logger.error(f"重试 {self.max_retries} 次后仍然失败，最后状态码: {last_response.status_code}")
        
        return None
    
    def _merge_headers(self, headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """
        合并请求头
        
        Args:
            headers: 自定义请求头
            
        Returns:
            合并后的请求头
        """
        merged_headers = self.default_headers.copy()
        if headers:
            merged_headers.update(headers)
        return merged_headers
    
    def _handle_response(self, response: requests.Response, expect_json: bool = True) -> Optional[Dict[str, Any]]:
        """
        统一处理响应
        
        Args:
            response: requests响应对象
            expect_json: 是否期望JSON响应
            
        Returns:
            解析后的响应数据，失败返回None
        """
        try:
            # 检查HTTP状态码
            if response.status_code != 200:
                self.logger.error(f"请求失败，状态码: {response.status_code}, 响应: {response.text}")
                return None
            
            if expect_json:
                try:
                    return response.json()
                except json.JSONDecodeError:
                    self.logger.error(f"解析JSON响应失败: {response.text}")
                    return None
            else:
                return {"text": response.text, "status_code": response.status_code}
                
        except Exception as e:
            self.logger.error(f"处理响应时发生错误: {str(e)}")
            return None
    
    def _log_request(self, method: str, url: str, **kwargs):
        """记录请求日志"""
        self.logger.debug(f"发起{method}请求: {url}")
        if 'data' in kwargs or 'json' in kwargs:
            self.logger.debug(f"请求参数: {kwargs.get('data') or kwargs.get('json')}")
    
    def get(self, url: str, params: Optional[Dict] = None, headers: Optional[Dict[str, str]] = None, 
            timeout: int = 30, expect_json: bool = True, **kwargs) -> Optional[Dict[str, Any]]:
        """
        发起GET请求
        
        Args:
            url: 请求URL
            params: URL参数
            headers: 自定义请求头
            timeout: 超时时间
            expect_json: 是否期望JSON响应
            **kwargs: 其他requests参数
            
        Returns:
            响应数据
        """
        merged_headers = self._merge_headers(headers)
        self._log_request("GET", url, params=params)
        
        def _make_request():
            return requests.get(
                url, 
                params=params,
                headers=merged_headers,
                cookies=self.cookies,
                timeout=timeout,
                **kwargs
            )
        
        return self._execute_with_retry(_make_request, expect_json=expect_json)
    
    def post(self, url: str, data: Optional[Union[Dict, str]] = None, json_data: Optional[Dict] = None,
             headers: Optional[Dict[str, str]] = None, timeout: int = 30, 
             expect_json: bool = True, **kwargs) -> Optional[Dict[str, Any]]:
        """
        发起POST请求
        
        Args:
            url: 请求URL
            data: 表单数据
            json_data: JSON数据
            headers: 自定义请求头
            timeout: 超时时间
            expect_json: 是否期望JSON响应
            **kwargs: 其他requests参数
            
        Returns:
            响应数据
        """
        merged_headers = self._merge_headers(headers)
        self._log_request("POST", url, data=data, json=json_data)
        
        def _make_request():
            return requests.post(
                url,
                data=data,
                json=json_data,
                headers=merged_headers,
                cookies=self.cookies,
                timeout=timeout,
                **kwargs
            )
        
        return self._execute_with_retry(_make_request, expect_json=expect_json)
    
    def generate_request_id(self) -> int:
        """生成请求ID"""
        return int(time.time() * 1000)
    
    def update_cookies(self, new_cookies: Union[Dict, str]):
        """
        更新cookies
        
        Args:
            new_cookies: 新的cookies数据
        """
        if isinstance(new_cookies, str):
            try:
                self.cookies = json.loads(new_cookies)
            except json.JSONDecodeError:
                self.logger.error("更新cookies失败: JSON解析错误")
        elif isinstance(new_cookies, dict):
            self.cookies = new_cookies
        else:
            self.logger.error("更新cookies失败: 不支持的数据类型")
    
    def set_default_header(self, key: str, value: str):
        """
        设置默认请求头
        
        Args:
            key: 请求头键
            value: 请求头值
        """
        self.default_headers[key] = value
    
    def remove_default_header(self, key: str):
        """
        移除默认请求头
        
        Args:
            key: 请求头键
        """
        if key in self.default_headers:
            del self.default_headers[key]
    
    def set_retry_config(self, max_retries: int = None, retry_delay: float = None, 
                        retry_backoff: float = None):
        """
        动态设置重试配置
        
        Args:
            max_retries: 最大重试次数
            retry_delay: 初始重试延迟时间（秒）
            retry_backoff: 重试退避倍数
        """
        if max_retries is not None:
            self.max_retries = max_retries
        if retry_delay is not None:
            self.retry_delay = retry_delay
        if retry_backoff is not None:
            self.retry_backoff = retry_backoff
        
        self.logger.info(f"重试配置已更新: max_retries={self.max_retries}, "
                        f"retry_delay={self.retry_delay}, retry_backoff={self.retry_backoff}")
    
    def disable_retry(self):
        """禁用重试功能"""
        self.max_retries = 0
        self.logger.info("重试功能已禁用")
    
    def enable_retry(self, max_retries: int = 3):
        """启用重试功能"""
        self.max_retries = max_retries
        self.logger.info(f"重试功能已启用，最大重试次数: {max_retries}")
    
    def get_retry_config(self) -> Dict[str, Union[int, float]]:
        """
        获取当前重试配置
        
        Returns:
            重试配置字典
        """
        return {
            'max_retries': self.max_retries,
            'retry_delay': self.retry_delay,
            'retry_backoff': self.retry_backoff
        }
    
    def force_relogin(self) -> bool:
        """
        强制重新获取cookies
        优先尝试刷新cookies，失败时进行完整重新登录
        
        Returns:
            是否重新获取cookies成功
        """
        if not self.shop_id or not self.user_id:
            self.logger.error("无法强制重新获取cookies：缺少shop_id或user_id")
            return False
            
        self.logger.info(f"手动触发账号 {self.account_name} 重新获取cookies...")
        return self._relogin_and_update_cookies()
    
    def force_refresh_cookies(self) -> bool:
        """
        强制只刷新cookies（不进行完整重新登录）
        
        Returns:
            是否刷新cookies成功
        """
        if not self.shop_id or not self.user_id:
            self.logger.error("无法强制刷新cookies：缺少shop_id或user_id")
            return False
            
        try:
            # 获取账号信息
            account_info = db_manager.get_account(self.channel_name, self.shop_id, self.user_id)
            if not account_info:
                self.logger.error(f"无法获取账号信息进行cookies刷新: shop_id={self.shop_id}, user_id={self.user_id}")
                return False
                
            username = account_info.get('username')
            password = account_info.get('password')
            
            if not username:
                self.logger.error(f"账号 {self.account_name} 缺少用户名，无法刷新cookies")
                return False
            
            self.logger.info(f"手动触发账号 {self.account_name} 刷新cookies（仅刷新模式）...")
            
            # 动态导入登录模块
            pdd_login_module = importlib.import_module('Channel.pinduoduo.pdd_login')
            refresh_pdd_cookies = pdd_login_module.refresh_pdd_cookies
            
            # 处理异步执行
            import asyncio
            import concurrent.futures
            
            def run_async_function(func, *args):
                """在新线程中运行异步函数"""
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(func(*args))
                finally:
                    new_loop.close()
            
            def execute_async_safely(func, *args):
                """安全执行异步函数"""
                try:
                    current_loop = asyncio.get_running_loop()
                    if current_loop:
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            future = executor.submit(run_async_function, func, *args)
                            return future.result(timeout=60)
                    else:
                        return run_async_function(func, *args)
                except RuntimeError:
                    return run_async_function(func, *args)
            
            # 执行刷新
            refresh_result = execute_async_safely(refresh_pdd_cookies, username, password)
            
            if refresh_result and isinstance(refresh_result, dict):
                new_cookies = refresh_result.get('cookies')
                if new_cookies:
                    self.update_cookies(new_cookies)
                    
                    # 更新数据库中的cookies
                    db_manager.update_account_cookies(
                        self.channel_name, 
                        self.shop_id, 
                        self.user_id, 
                        new_cookies
                    )
                    
                    self.logger.info(f"账号 {self.account_name} cookies刷新成功（仅刷新模式）")
                    return True
                else:
                    self.logger.error(f"账号 {self.account_name} cookies刷新失败：未获取到有效cookies")
                    return False
            else:
                self.logger.error(f"账号 {self.account_name} cookies刷新失败")
                return False
                
        except Exception as e:
            self.logger.error(f"账号 {self.account_name} cookies刷新过程中发生错误: {str(e)}")
            return False